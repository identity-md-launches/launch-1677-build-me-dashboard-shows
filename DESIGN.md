# poidh activity design system

## Overview

This is a one-page, read-only dashboard for understanding a year of poidh v3 activity across Ethereum, Arbitrum, and Base. The interface leads with the selected period, chain filters, export action, and four summary counts. A daily or weekly chart, chain comparison, and recent bounties provide context; expandable methodology explains the saved data.

The implemented visual direction is a quiet analytics workspace: pale neutral canvas, white surfaces, compact typography, and orange emphasis. The snapshot date remains visible near the title. Counts and definitions take precedence over promotional copy. There is no wallet connection, dark theme, or persistent user preference.

The source of truth is [src/styles.css](src/styles.css), [src/chart.css](src/chart.css), and the components in [src/App.tsx](src/App.tsx), [src/ActivityChart.tsx](src/ActivityChart.tsx), and [src/Icons.tsx](src/Icons.tsx).

## Colors

`src/styles.css` defines the neutral and orange primitives in `:root`, then maps them to semantic roles. Components use the semantic variables; chain colors represent categories and status colors have explicit text labels.

| Semantic token | Implemented value | Role |
| --- | --- | --- |
| `--color-bg` | `#f7f8fa` | Page canvas |
| `--color-surface` | `#ffffff` | Header, panels, selected controls |
| `--color-surface-subtle` | `#f0f2f5` | Neutral control groups, secondary badges, share tracks |
| `--color-text` | `#202630` | Primary text and values |
| `--color-text-secondary` | `#657080` | Supporting text on white or page canvas |
| `--color-text-strong-secondary` | `#525d6e` | Summary labels and text on subtle surfaces |
| `--color-border` | `#e6e8ec` | Panel edges, chart grid, row dividers |
| `--color-control-border` | `#c4c9d2` | Buttons, selects, selected chain filter |
| `--color-accent` | `#ce4924` | Export action, brand symbol, chart bars |
| `--color-accent-hover` | `#a93616` | Primary hover, active metric label, methodology links |
| `--color-accent-soft` | `#fff3ed` | Active metric background |
| `--color-focus` | `#6a41c7` | Keyboard focus outline |
| `--color-ethereum` | `#69619f` | Ethereum icon and bounty-share bar |
| `--color-arbitrum` | `#23839a` | Arbitrum icon and bounty-share bar |
| `--color-base` | `#225fea` | Base icon and bounty-share bar |
| `--color-success` / `--color-success-soft` | `#23734f` / `#eef8f1` | Open bounty badge text/background |

The completed badge uses the local pair `#43499b` / `#f0f1fd`; canceled badges use strong secondary text on the subtle surface. The selected metric border is `#f5cfbe`. Text selection uses `#ffdbc8` with primary text. These local values are in `src/styles.css`; they are not additional named token ramps.

`src/chart.css` maps `--chart-grid`, `--chart-text`, `--chart-bar`, and `--chart-selection` to the page's semantic colors. Its fallback values support the standalone component but are not the active palette in this page. Selected bars use the darker accent plus a guide line, marker, and textual value. Chain names, selected borders, `aria-pressed`, and status words keep meaning available without color.

Measured contrast and review coverage are recorded in the validation documentation. Do not use the lighter border tokens as text colors.

## Typography

The interface uses the locally bundled variable **DM Sans**, followed by `system-ui, sans-serif`. Its normal face is declared for weights 400–700 and served from [public/assets/dm-sans-latin.woff2](public/assets/dm-sans-latin.woff2); the font license is adjacent. Rendered font loading was checked with `document.fonts`. The UI uses only weights 400, 600, and 700. Contract addresses use the browser's monospace code font.

| Token | Size at the 16px root | Main roles |
| --- | --- | --- |
| `--text-xs` | 12px / `0.75rem` | Metadata, chart labels, badges, compact controls |
| `--text-sm` | 14px / `0.875rem` | Desktop controls, table cells, summary labels, methodology |
| `--text-base` | 16px / `1rem` | Intro copy, small headings, mobile selects |
| `--text-lg` | 20px / `1.25rem` | Desktop section headings and insight values |
| `--text-xl` | 32px / `2rem` | Metric values, wordmark, mobile page heading |
| `--text-display` | 40px / `2.5rem` | Desktop page heading |

The page heading uses 700 weight, 1.1 line height, and `-0.04em` tracking. Section headings use 600, 1.3, and `-0.02em`. Small headings use 600 and 1.4. Paragraphs use 1.5; methodology uses 1.6. Metric numbers use 600, 1.2, and `-0.04em`. Only the wordmark uses `-0.06em` tracking.

Summary values, insight values, tables, and the chart use tabular numbers. Bounty names and full contract addresses can wrap; no essential value is ellipsized. Labels remain sentence case. Selects become 16px on mobile to avoid input zoom. `font-synthesis: none`, antialiasing, and `font-display: swap` are set globally.

## Layout

The header and `.main-container` share a 1280px maximum width, centered with 40px desktop inline padding. The page uses a 4px spacing rhythm; `--space-1/2/3/4/5/6/8/10` declare 4, 8, 12, 16, 20, 24, 32, and 40px. Existing selectors mostly spell out these values directly. Reuse the same rhythm when extending them.

Summary cards form four equal columns with a 16px gap. The chart spans the content width. `.lower-grid` places the chain table and period insights in 1.35:1 columns with a 24px gap. Recent bounties and methodology span the width. Methodology text is capped at 860px. Controls sit before the content they change.

| Breakpoint | Implemented adaptation |
| --- | --- |
| Up to `70rem` (1120px) | Inline page/header padding becomes 28px; lower columns become 1.25:1 with 20px gap; card interiors tighten. |
| Up to `54rem` (864px) | Summary becomes two columns; lower panels stack; the three insight items form columns inside their panel; filter actions can wrap. |
| Up to `38rem` (608px) | Page padding is 24px 16px; introduction stacks; page heading becomes 32px; chain filters sit above date/export controls; section headings become 16px; panel interiors become 16px; bounty status wraps below its name; definitions become one column. Summary cards use `repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))`, giving two columns at ordinary phone text size and one when text needs more room. |
| Up to `21rem` (336px) | Inline padding becomes 12px; chain filters become a two-column grid; secondary brand text and nonessential icons disappear; snapshot date gets its own line. |

The chart measures its own frame with `ResizeObserver`. The plot is 220px high below a 520px frame width and 250px otherwise; x-axis ticks reduce from seven to five to three as space narrows. Inspection text wraps, with its help line on a separate row below 540px.

The daily table deliberately retains a 450px minimum width inside a named, focusable horizontal scroll region. The chain comparison has its own named, focusable horizontal scroll region for enlarged text. These preserve numerical columns while containing overflow within each table. Header, chain filters, date/export actions, and chart controls can wrap. Contract addresses use `overflow-wrap: anywhere`.

Production screenshots at 390px and 1440px confirm these layouts. At 390 × 844 with normal text size, the product title, chain/date controls, Export CSV, all four counts, and chart controls are on the first screen. A separate 200% root-text check at 390px confirms a 390px document width while controls wrap and summary cards stack; this is CSS text enlargement, not browser-native zoom. The exact validation widths and remaining manual checks are recorded separately.

## Elevation & Depth

The surface system is flat. White panels are distinguished from the page by a 1px border, with no box shadows. Row dividers communicate tabular structure. Active view controls use a white fill on a subtle neutral group. There are no overlays, floating action bars, or animated page entrances.

The skip link is the only fixed element and appears on keyboard focus (`z-index: 10`). Focused buttons and selects use `z-index: 1` so adjacent controls do not cover the ring.

## Shapes

`--radius-panel` is 12px and `--radius-control` is 7px. Metric cards and large panels share the panel radius. Buttons, chain filters, and the date selector share the control radius. View controls and status tags use 5px inner radii; chart controls and focusable plot use 6px. Brand and bounty icons use 7–9px corners according to size. Chart bars use a maximum 2px radius. Dots are circles; share tracks use 3px corners.

## Components

| Component or pattern | Source and behavior |
| --- | --- |
| `Header` | `src/App.tsx`: brand/home link on the leading edge; methodology and external poidh link on the trailing edge. Methodology navigation is omitted from the narrow header because the native disclosure remains on the page. |
| Dashboard filters | `Dashboard` in `src/App.tsx`: native chain buttons with `aria-pressed`; labeled date select for 365/90/30/7 days; primary `.button` exports the currently selected daily rows. A stable polite status region announces chain, date, metric, and download updates. |
| `.button` | `src/styles.css`: bordered neutral default, orange `.primary`, compact `.small`; disabled pagination uses native `disabled`. Standard buttons and chain filters are at least 44px high; `.small` is 40px. |
| `MetricCard` | `src/App.tsx`: receives `title`, numeric `value`, `detail`, and icon name; displays a descriptive heading, tabular value, and short definition. Static information, not a control. |
| `ActivityChart` | `src/ActivityChart.tsx` with `src/chart.css`: accepts `rows`, `metric`, and `grouping`; daily counts or Monday-start UTC week totals. Partial edge weeks are labeled. The focusable plot has slider semantics and a descriptive value; arrows, Home, and End inspect dates. Pointer movement or touch selection uses the same state. A visible selected-date/value row supplements the SVG. Zero selections show an explicit empty message. |
| Chart controls | `Dashboard`: pressed-state metric buttons, labeled daily/weekly select, and chart/table view buttons. On mobile, metric and chart/table buttons are at least 44px high. The table always represents daily rows and its subtitle says so. |
| `DailyTable` | `src/App.tsx`: semantic caption, column/row headers, newest-first rows, ten per page, disabled boundary buttons. Changing chain/range resets pagination. Provides a numerical alternative to the chart. |
| Chain comparison | `Dashboard`: all three chains remain visible for the selected dates; row buttons filter the rest of the dashboard. Text percentages accompany share bars, and the selected row is underlined. Its named, focusable scroll region keeps enlarged table columns reachable. |
| Bounty list | `Dashboard`: complete wrapping names link to their actual poidh bounty pages; chain, date, ID, and status remain visible. Empty windows provide a longer-range action. Status is explicitly qualified as recorded at snapshot time. |
| Methodology disclosure | Native `details`/`summary` in `Dashboard`: keyboard-operable, includes definitions, full contract-address links, limitations, and source download. Both methodology hashes open the disclosure. |
| Loading/error state | `App`: local snapshot loading is announced; load/validation failures show a readable explanation and `Try again`. No dashboard values are fabricated during loading. |
| `Icon` / `ChainIcon` | `src/Icons.tsx`: local SVGs, decorative to assistive technology; ordinary icons share a 1.7px rounded stroke and `currentColor`. Chain SVGs use category colors alongside visible chain names. |

Global `:focus-visible` uses a 3px purple outline with a 4px offset; the chart uses 2px with the same offset. Hover styles are restricted to hover-capable devices. Only background, color, and border color transition, for 120ms with `ease`, and only when reduced motion is not requested. Forced-colors rules preserve selected controls, chart marks, and focus indication.

## Do's and Don'ts

- Start new dashboard sections with `.panel` and `.panel-heading`, aligned to the existing container. Choose from the six type tokens and existing spacing steps.
- Keep data scope and time basis near the results. Any new aggregation must share the chain/date selection and document exceptions as the chain comparison does.
- Give one action the filled orange button treatment. Use neutral controls for peer filters and explicit selected states.
- Preserve native semantics, full values, keyboard focus, and a text/table alternative for new visual data.
- Do not describe the bundled snapshot as live or treat missing indexed history as independently verified inactivity. Do not sum distinct-wallet counts across periods.
- Do not add a second font, a shadow system, or decorative motion to extend a section. Reuse the existing components, chart tokens, and local icon pattern.

Design and review drew on the supplied Better Interface guide by Jakub Krehel (MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`). This implementation document follows the supplied documentation method adapted from Paul Bakaus's Impeccable (Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). The descriptions and tables above document this repository's own implementation.
