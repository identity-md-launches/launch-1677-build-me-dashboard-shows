# poidh activity

A one-page dashboard of daily poidh v3 activity on Ethereum, Arbitrum, and Base. Filter by chain and date range, inspect daily or weekly charts, browse a daily table, and export the selected data as CSV. The production website is included in **`dist/`**.

## Run locally

Use Node.js 22.12+ and npm. Python 3.10+ is needed only for data checks and refreshes.

```sh
npm ci
npm run dev
```

To check and rebuild the static export:

```sh
npm run typecheck
npm run data:check
npm run build
npm run preview
```

Open the local address printed by Vite. Preview serves the production build. Any static HTTP server can serve `dist/`; opening `index.html` directly as a `file:` URL does not support its JSON fetch. Vite uses `base: './'`, all runtime assets are bundled locally, and no server-side application or SPA route rewriting is needed. Keep `dist/index.html`, `dist/assets/`, and `dist/data/` together. There are no keys, wallet connections, analytics trackers, or runtime API requests.

## What the data says

The delivered snapshot was fetched on **14 October 2026 at 03:34 UTC**. It covers the previous 365 complete UTC days, **14 October 2025–13 October 2026**, and contains:

| Metric | Three-chain total |
| --- | ---: |
| Bounties created | 691 |
| Proofs submitted | 4,359 |
| Bounties completed | 408 |
| Unique event-associated wallet addresses | 1,219 |

The dashboard follows the lifecycle described in the [official poidh protocol guide](https://github.com/picsoritdidnthappen/poidh-app/blob/prod/SKILL.md): a bounty creates an opportunity, a claim submits proof, and acceptance completes a bounty. Wallet addresses measure participation, with deduplication across chains and dates. Addresses do not identify unique people. A proof submission is not necessarily valid or accepted, and completion does not establish withdrawal of funds.

Only the three requested v3 contracts are included:

| Network | Contract |
| --- | --- |
| Ethereum | `0xe731dfadbff20542e10d09d26fc71445c70d4232` |
| Arbitrum | `0x5555fa783936c260f77385b4e153b9725fef1719` |
| Base | `0x5555fa783936c260f77385b4e153b9725fef1719` |

Data comes from the public poidh indexer. Contract scope is inferred from its bounty-ID mapping using documented v3 offsets; the API does not expose emitting contract addresses. The snapshot is derived data, not an independently verified replay of chain logs. V3 first appears in these records on 20 January 2026 for Base/Arbitrum and 14 May 2026 for Ethereum. Earlier days show zero matching indexed activity. Legacy v2 and Degen activity are excluded. Latest indexed Arbitrum activity is 7 October; a quiet chain and indexer lag cannot be distinguished here.

The visible date and “Saved snapshot” label disclose freshness. Filters are relative to the snapshot end, not the visitor's clock. Chain comparison always displays all three networks for the selected dates and labels that scope explicitly. ETH flow, USD prices, and payout totals are omitted because mutable bounty reward amounts would not establish historical financial flows.

## Refresh the snapshot

```sh
npm run data:refresh
npm run data:check
npm run build
```

Refresh needs network access but no credentials. The script paginates every bounty and event page, validates complete coverage and v3 ID relationships, and replaces the snapshot atomically. Failure retains the previous file. The website itself works from its bundled snapshot, including when external services are unavailable. See [scripts/README.md](scripts/README.md) for source definitions, provenance, optional historical windows, and failure behavior.

## Validation

The worker ran the production build and TypeScript check using the delivered manifest/lockfile in a temporary build directory; dependencies and package caches were kept outside the repository. The result was copied into `dist/`. An offline snapshot check, seven source-reconciliation tests, and three failed-refresh/integrity guards passed. A fresh network ingestion reproduced the saved data and source hashes.

Browser validation exercised the actual export under `/dist/` in Chromium and WebKit. It checked all 16 chain/date combinations against the source JSON, CSV contents and filenames, chart pointer/keyboard/touch interaction, table pagination, source links, empty states, loading, failed/corrupt data, retry, and responsive layouts. The pinned design probe passed all 16 checks after fixes. Detailed results, fixes, screenshots, and limitations are in [artifacts/validation.md](artifacts/validation.md).

To repeat the interaction checks, start `npm run preview` in one terminal, then:

```sh
npx playwright install chromium webkit
npm run test:browser -- http://localhost:4173/
```

On Linux, Playwright may also require browser system libraries. `POIDH_BROWSERS=chromium` restricts a local run to one installed engine; such a run does not establish WebKit compatibility. The harness writes to `test/scratch/` by default. Its `--stdout` option suppresses file output. Browser tests require a running HTTP preview and do not open a wallet or perform protocol transactions.

Native screen-reader sessions, physical phones, native browser zoom, and independent raw-chain replay were not performed. Text enlargement to 200% is checked separately from browser zoom. Axe found no violations in tested states; its incomplete SVG contrast checks do not constitute a full accessibility certification. Public RPC/explorer verification attempts returned 403 or required API credentials. The alternate `https://poidh.xyz/skill.md` endpoint returned 403 here; the official GitHub guide was available.

## Project map

- `src/`: React/TypeScript interface, data transformations, responsive SVG chart, and styles.
- `public/`: complete snapshot, local font and license, favicon, and share-card assets.
- `scripts/`: reproducible data ingestion and browser checks.
- `dist/`: complete static website; intentionally included in the deliverable.
- [DESIGN.md](DESIGN.md): implemented tokens, typography, components, and responsive behavior.
- [artifacts/validation.md](artifacts/validation.md): worker validation evidence and limitations.
- [artifacts/submission-budget.md](artifacts/submission-budget.md): explicit path budgets and final size audit.

Dependency folders and generated caches are excluded at every nesting level. `.gitignore` has a 512-byte path budget; it does not exclude `dist/`. The editable share-card SVG and its PNG raster are local assets; regenerate the PNG if changing that artwork. DM Sans is distributed under the SIL Open Font License included alongside it. Design-guide attribution is recorded in `DESIGN.md`.
