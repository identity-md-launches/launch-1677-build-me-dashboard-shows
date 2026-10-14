#!/usr/bin/env python3
"""Refresh the public poidh v3 snapshot using only Python's standard library.

No credentials, wallet, RPC provider, or runtime server are required. A failed
refresh leaves the previous snapshot untouched. See --help for offline checks.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = "https://indexer.poidh.xyz/api/v1"
OUTPUT = Path(__file__).resolve().parents[1] / "public/data/activity.json"
CHAINS = [
    {"id": "ethereum", "chainId": 1, "name": "Ethereum", "slug": "mainnet",
     "address": "0xe731dfadbff20542e10d09d26fc71445c70d4232",
     "explorer": "https://etherscan.io", "frontendOffset": 0},
    {"id": "arbitrum", "chainId": 42161, "name": "Arbitrum", "slug": "arbitrum",
     "address": "0x5555fa783936c260f77385b4e153b9725fef1719",
     "explorer": "https://arbiscan.io", "frontendOffset": 180},
    {"id": "base", "chainId": 8453, "name": "Base", "slug": "base",
     "address": "0x5555fa783936c260f77385b4e153b9725fef1719",
     "explorer": "https://basescan.org", "frontendOffset": 986},
]
ADDRESS = re.compile(r"^0x[0-9a-f]{40}$")
ACTION_METRICS = {"bounty created": "bounties", "claim created": "claims", "claim accepted": "completed"}


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def iso(timestamp: int | float) -> str:
    return datetime.fromtimestamp(int(timestamp), timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_json(url: str) -> list[dict]:
    for attempt in range(4):
        try:
            request = Request(url, headers={"Accept": "application/json", "User-Agent": "poidh-pulse-static-snapshot/1.0"})
            with urlopen(request, timeout=45) as response:
                data = json.load(response)
            if not isinstance(data, list):
                raise ValueError(f"Expected an array from {url}")
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def fetch_table(task: tuple[int, str, Path | None]) -> tuple[int, str, list[dict]]:
    chain_id, table, cache_dir = task
    cache_file = cache_dir / f"{chain_id}-{table}.json" if cache_dir else None
    if cache_file and cache_file.exists():
        rows = json.loads(cache_file.read_text())
        print(f"Read external cache: {chain_id} {table}, {len(rows):,} rows", flush=True)
        return chain_id, table, rows
    rows: list[dict] = []
    pages: set[str] = set()
    for offset in range(0, 1_000_000, 100):
        page = fetch_json(f"{API}/{table}?{urlencode({'chainId': chain_id, 'limit': 100, 'offset': offset})}")
        fingerprint = hashlib.sha256(canonical(page).encode()).hexdigest()
        if page and fingerprint in pages:
            raise ValueError(f"Repeated pagination page: chain {chain_id}, {table}, offset {offset}")
        pages.add(fingerprint)
        if any(row.get("chainId") != chain_id for row in page):
            raise ValueError("API chain filter did not hold")
        rows.extend(page)
        if len(page) < 100:
            break
    else:
        raise ValueError("Pagination safety limit reached; snapshot not replaced")
    if cache_file:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(canonical(rows))
    print(f"Fetched {chain_id} {table}: {len(rows):,} rows", flush=True)
    return chain_id, table, rows


def build_snapshot(tables: dict, end: date, generated_at: str) -> dict:
    start = end - timedelta(days=364)
    end_exclusive = datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp()
    start_timestamp = datetime.combine(start, datetime.min.time(), timezone.utc).timestamp()
    daily = {}
    for index in range(365):
        day = (start + timedelta(days=index)).isoformat()
        for chain in CHAINS:
            daily[(day, chain["id"])] = {"date": day, "chain": chain["id"], "bounties": 0, "claims": 0, "completed": 0, "wallets": set()}
    chains = []
    bounties = []
    audits = []
    for chain in CHAINS:
        chain_id = chain["chainId"]
        all_bounties = tables[(chain_id, "bounties")]
        all_transactions = tables[(chain_id, "transactions")]
        if any(row.get("chainId") != chain_id for row in all_bounties + all_transactions):
            raise ValueError(f"Unexpected chain in source rows for {chain_id}")
        if len({row["id"] for row in all_bounties}) != len(all_bounties):
            raise ValueError(f"Duplicate bounty IDs on {chain_id}")
        # The official poidh skill specifies these frontend offsets. The relation
        # must hold for every included row, not merely the first/last IDs.
        scoped_bounties = [row for row in all_bounties if row["id"] >= chain["frontendOffset"]]
        for row in scoped_bounties:
            if row["id"] - row["onChainId"] != chain["frontendOffset"]:
                raise ValueError(f"Contract/frontend ID relation changed on {chain_id}: {row['id']}")
        bounty_ids = {row["id"] for row in scoped_bounties}
        distinct_events = {canonical(row): row for row in all_transactions}
        events = sorted((row for row in distinct_events.values() if row["bountyId"] in bounty_ids),
                        key=lambda row: (int(row["timestamp"]), row["tx"], row["index"], row["action"]))
        created = Counter(row["bountyId"] for row in events if row["action"] == "bounty created")
        if set(created) != bounty_ids or any(count != 1 for count in created.values()):
            raise ValueError(f"Created-event/registry mismatch on {chain_id}; refusing partial history")
        accepted = Counter(row["bountyId"] for row in events if row["action"] == "claim accepted")
        if any(count != 1 for count in accepted.values()):
            raise ValueError(f"Multiple accepted-claim events per bounty on {chain_id}")
        registry = {row["id"]: row for row in scoped_bounties}
        for row in events:
            if row["action"] == "bounty created" and int(row["timestamp"]) != int(registry[row["bountyId"]]["createdAt"]):
                raise ValueError(f"Created timestamp mismatch on {chain_id}/{row['bountyId']}")
        claims = Counter(row["bountyId"] for row in events if row["action"] == "claim created")
        skipped_wallets = 0
        period_events = [row for row in events if start_timestamp <= int(row["timestamp"]) < end_exclusive]
        for event in period_events:
            row = daily[(iso(event["timestamp"])[:10], chain["id"])]
            metric = ACTION_METRICS.get(event["action"])
            if metric:
                row[metric] += 1
            address = event["address"].lower()
            if ADDRESS.fullmatch(address) and int(address[2:], 16) != 0:
                row["wallets"].add(address)
            else:
                skipped_wallets += 1
        for bounty in scoped_bounties:
            if not start_timestamp <= int(bounty["createdAt"]) < end_exclusive:
                continue
            status = "canceled" if bounty["isCanceled"] else "completed" if bounty["id"] in accepted else "open"
            bounties.append({
                "id": bounty["id"], "onChainId": bounty["onChainId"], "chain": chain["id"],
                "name": bounty["title"], "createdAt": iso(bounty["createdAt"]),
                "amountEth": format(Decimal(bounty["amount"]) / Decimal(10**18), "f"),
                "status": status, "url": f"https://poidh.xyz/{chain['slug']}/bounty/{bounty['id']}",
                "claims": claims[bounty["id"]],
            })
        chains.append({**chain, "firstActivity": iso(events[0]["timestamp"]) if events else None,
                       "lastActivity": iso(events[-1]["timestamp"]) if events else None})
        audits.append({
            "chain": chain["id"], "fetchedBounties": len(all_bounties), "fetchedEventRows": len(all_transactions),
            "includedV3Bounties": len(scoped_bounties), "includedV3EventRows": len(events),
            "periodEventRows": len(period_events), "periodDistinctTransactions": len({row["tx"] for row in period_events}),
            "duplicateRowsRemoved": len(all_transactions) - len(distinct_events),
            "invalidOrZeroWalletRowsExcluded": skipped_wallets,
            "rawBountiesSha256": hashlib.sha256(canonical(all_bounties).encode()).hexdigest(),
            "rawTransactionsSha256": hashlib.sha256(canonical(all_transactions).encode()).hexdigest(),
        })
    daily_rows = [{**row, "wallets": sorted(row["wallets"])} for row in daily.values()]
    return {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "period": {"start": start.isoformat(), "end": end.isoformat(), "timezone": "UTC"},
        "source": {
            "name": "poidh public indexer", "url": "https://indexer.poidh.xyz/swagger",
            "docsUrl": "https://indexer.poidh.xyz/openapi/doc",
            "skillUrl": "https://github.com/picsoritdidnthappen/poidh-app/blob/prod/SKILL.md",
            "apiBase": API,
            "method": "Every bounties and transactions page on chains 1, 42161 and 8453, 100 rows per page. Include bounty IDs with the official v3 frontend offset and validate every id/onChainId relation. Group their indexed events by UTC day. Verify one creation event and matching creation timestamp for every included bounty.",
            "definitions": {
                "bounties": "Number of indexed bounty created events on each UTC day.",
                "claims": "Number of indexed claim created events (proof submissions) on each UTC day, including claims later rejected or hidden by the frontend.",
                "completed": "Number of indexed claim accepted events on each UTC day. Acceptance completes a bounty; it is not a count of withdrawals or successful payment transfers.",
                "wallets": "Distinct valid, nonzero event-associated wallet addresses across indexed protocol actions. Lowercase addresses are deduplicated across all selected chains and dates. An address is not a person and is not necessarily the transaction sender.",
                "amountEth": "Current indexed bounty reward amount in ETH at snapshot time. Not a historical deposit flow, net payout, or withdrawal total.",
                "status": "Current indexed state at snapshot time: canceled flag first, otherwise completed when an accepted event exists, otherwise open.",
                "claimsInBountyList": "Lifetime indexed proof submissions for that bounty at snapshot time, rather than submissions only within the selected period.",
            },
            "limitations": [
                "This is a bundled snapshot of the public offchain indexer, not a live or independently audited replay of contract logs. Indexer omissions and lag cannot be ruled out.",
                "Contract scope is inferred from the official v3 frontend offsets (Ethereum 0, Arbitrum 180, Base 986) and each indexed id/onChainId relation; the REST API does not expose the emitting contract address.",
                "The 365-day period includes days before these v3 contracts first appear in the indexer. Legacy v2 and Degen activity are intentionally excluded. Zero means no matching indexed events, not an assertion about unseen chain history.",
                "Event-associated wallets include creators, claimants, contributors and other indexed actors or recipients. Invalid indexer sentinel addresses such as 0x00 are excluded. Addresses are not people.",
                "Bounty status, listed reward values and per-bounty claim totals are current at snapshot time. Daily activity counts use event timestamps and exclude the unfinished current UTC day.",
                "The refresh script does not independently replay contract logs. ETH flow and payout totals are omitted rather than inferred from mutable bounty amounts.",
            ],
            "audit": audits,
        },
        "chains": chains,
        "daily": daily_rows,
        "bounties": sorted(bounties, key=lambda row: (row["createdAt"], row["chain"], row["id"]), reverse=True),
    }


def validate(snapshot: dict) -> dict:
    assert snapshot["schemaVersion"] == 1
    start, end = (date.fromisoformat(snapshot["period"][key]) for key in ("start", "end"))
    assert (end - start).days == 364, "Expected 365 complete UTC dates"
    chain_ids = {chain["id"] for chain in CHAINS}
    assert len(snapshot["daily"]) == 365 * len(chain_ids)
    keys = set()
    wallets = set()
    totals = Counter()
    for row in snapshot["daily"]:
        key = (row["date"], row["chain"])
        assert key not in keys, "Duplicate daily record"
        keys.add(key)
        assert row["chain"] in chain_ids
        assert start <= date.fromisoformat(row["date"]) <= end
        for metric in ACTION_METRICS.values():
            assert isinstance(row[metric], int) and row[metric] >= 0
            totals[metric] += row[metric]
        assert row["wallets"] == sorted(set(row["wallets"]))
        for wallet in row["wallets"]:
            assert ADDRESS.fullmatch(wallet) and int(wallet[2:], 16) != 0
        wallets.update(row["wallets"])
    bounty_keys = set()
    for bounty in snapshot["bounties"]:
        key = (bounty["chain"], bounty["id"])
        assert key not in bounty_keys
        bounty_keys.add(key)
        chain = next(chain for chain in CHAINS if chain["id"] == bounty["chain"])
        assert bounty["id"] - bounty["onChainId"] == chain["frontendOffset"]
        assert bounty["url"] == f"https://poidh.xyz/{chain['slug']}/bounty/{bounty['id']}"
        assert start.isoformat() <= bounty["createdAt"][:10] <= end.isoformat()
        assert Decimal(bounty["amountEth"]) >= 0
        assert bounty["status"] in ("open", "completed", "canceled")
    assert len(snapshot["bounties"]) == totals["bounties"], "Registry/daily bounty totals differ"
    return {**totals, "wallets": len(wallets), "dailyRows": len(keys), "listedBounties": len(bounty_keys)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--end", type=date.fromisoformat, help="Final full UTC date, YYYY-MM-DD (default: yesterday)")
    parser.add_argument("--cache-dir", type=Path, help="Optional external raw-data cache; use a path outside the repository. Existing files are reused.")
    parser.add_argument("--check", action="store_true", help="Validate the existing snapshot offline; do not fetch or write")
    args = parser.parse_args()
    if args.check:
        print(json.dumps(validate(json.loads(args.output.read_text())), indent=2))
        return
    now = datetime.now(timezone.utc)
    end = args.end or (now.date() - timedelta(days=1))
    if end >= now.date():
        parser.error("--end must be a completed UTC day")
    tasks = [(chain["chainId"], table, args.cache_dir) for chain in CHAINS for table in ("bounties", "transactions")]
    with ThreadPoolExecutor(max_workers=6) as pool:
        tables = {(chain_id, table): rows for chain_id, table, rows in pool.map(fetch_table, tasks)}
    snapshot = build_snapshot(tables, end, iso(datetime.now(timezone.utc).timestamp()))
    totals = validate(snapshot)
    payload = canonical(snapshot) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(payload)
    temporary.replace(args.output)
    print(f"Wrote {args.output}: {len(payload.encode()):,} bytes")
    print(json.dumps(totals, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, AssertionError) as error:
        print(f"Data validation failed; existing snapshot retained: {error}", file=sys.stderr)
        sys.exit(1)
