# Data refresh

The browser reads `public/data/activity.json` locally. It makes no indexer or RPC request and needs no wallet, credentials, backend, or remote runtime asset.

Use Python 3.10 or newer to refresh the saved snapshot:

```sh
python3 scripts/update-data.py
python3 scripts/update-data.py --check
```

The default window is the previous 365 **complete UTC days**, ending yesterday. `--end YYYY-MM-DD` selects a different final complete day. `--output /path/to/activity.json` writes elsewhere. The script fetches every page of the public indexer's `bounties` and `transactions` tables for Ethereum (1), Arbitrum (42161), and Base (8453), then replaces the output atomically only after validation. Network errors or inconsistent source records leave the previous snapshot intact. Refresh data before rebuilding the frontend so `dist/data/activity.json` includes the new snapshot.

`--check` validates the saved JSON without a network request or mutation. For research only, `--cache-dir /tmp/poidh-data-cache` can save and reuse raw API responses **outside this repository**. Remove that external cache to obtain fresh responses. A cache-based rebuild records its assembly time in `generatedAt`; the raw source SHA-256 hashes in `source.audit` identify the exact responses used.

## Contract scope and counting

The official [poidh skill](https://github.com/picsoritdidnthappen/poidh-app/blob/prod/SKILL.md) maps frontend bounty IDs to v3 contract IDs with offsets of 0 (Ethereum), 180 (Arbitrum), and 986 (Base). Every included bounty must satisfy `id - onChainId = offset`; its associated indexed events provide the daily series. All three exact contract addresses are embedded in the dataset. V2 and Degen records are excluded.

The [indexer API documentation](https://indexer.poidh.xyz/openapi/doc) does not expose each event's emitting contract address. The snapshot therefore infers scope from the documented ID relation; it is not an independent replay of contract logs. Indexer omissions, lag, and non-atomic reads remain possible.

| Field | Meaning |
| --- | --- |
| `daily[].bounties` | `bounty created` events on the UTC date |
| `daily[].claims` | `claim created` events, including proofs later rejected or hidden |
| `daily[].completed` | `claim accepted` events on the acceptance date; not withdrawals |
| `daily[].wallets` | Sorted, distinct lowercase nonzero addresses associated with any indexed protocol action that day |
| `bounties[].status` | State at snapshot time: canceled flag, otherwise completed if an acceptance exists, otherwise open |
| `bounties[].amountEth` | Current indexed bounty reward, not historical deposits or net payouts |
| `bounties[].claims` | Lifetime indexed submissions on that bounty at snapshot time |

Wallets must be deduplicated again across all selected chains and days. They are addresses rather than unique people or guaranteed transaction senders. Invalid indexer sentinels such as `0x00` are omitted. A transaction/log index can carry different semantic actions (for example, `voting resolved` and `claim accepted`), so the script removes only identical event rows, preserving both actions.

Every included bounty must have exactly one creation event with a timestamp matching its registry record. Each bounty may have only one accepted-claim event. The output contains one daily row for every date and chain, including zero rows before first indexed v3 activity. Zero means no matching indexed events, not proof that an unavailable or unindexed event never occurred.

## Delivered snapshot

Window: 2025-10-14 through 2026-10-13, UTC. The dataset contains 1,095 daily rows and 691 bounty records. The indexer responses were fetched on 2026-10-14 and the uncached production refresh independently reproduced the saved records and source hashes.

| Chain | Bounties created | Proofs submitted | Bounties completed | Unique wallet addresses |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 38 | 143 | 22 | 147 |
| Arbitrum | 155 | 708 | 110 | 304 |
| Base | 498 | 3,508 | 276 | 1,056 |
| Combined, deduplicated | 691 | 4,359 | 408 | 1,219 |

First indexed activity is 2026-01-20 for Base and Arbitrum, and 2026-05-14 for Ethereum. These are first observed event dates, not independently verified deployment timestamps. Latest indexed events are 2026-10-13 for Base and Ethereum and 2026-10-07 for Arbitrum; the latter alone cannot distinguish a quiet chain from indexer lag.

Worker checks passed: complete date/chain coverage; every daily metric and address set reconciled to fetched event rows; registry creation timestamps and current states matched; legacy contracts and malformed wallet sentinels were excluded; paired semantic events retained; a changed frontend offset rejected refresh without replacing the previous output. Independent raw-chain checks were attempted through public RPCs and explorers but were unavailable (HTTP 403 or API key required). ETH deposit, payout, revenue, and USD totals are intentionally not estimated.
