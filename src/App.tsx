import { useEffect, useMemo, useRef, useState } from "react";
import ActivityChart from "./ActivityChart";
import { ChainIcon, Icon } from "./Icons";
import {
  aggregateDays,
  chainNames,
  metricLabels,
  number,
  selectDaily,
  shortDate,
  startForRange,
  summarize,
  toCsv,
  validateSnapshot,
} from "./data";
import type { ChainFilter, DailyTotal, Metric, Snapshot } from "./data";

const ranges = [
  { days: 365, name: "Last 12 months" },
  { days: 90, name: "Last 90 days" },
  { days: 30, name: "Last 30 days" },
  { days: 7, name: "Last 7 days" },
];
const metrics: Metric[] = ["bounties", "claims", "completed"];

function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="./" aria-label="poidh activity home">
          <span className="brand-symbol">
            <Icon name="camera" size={22} />
          </span>
          <span className="wordmark">poidh</span>
          <span className="brand-divider" />
          <span className="brand-label">activity</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#about-data" className="nav-link">
            About the data
          </a>
          <a
            className="visit-link"
            href="https://poidh.xyz/"
            target="_blank"
            rel="noreferrer"
          >
            Visit poidh <Icon name="arrow" size={16} />
          </a>
        </nav>
      </div>
    </header>
  );
}

function DailyTable({ rows }: { rows: DailyTotal[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const pageCount = Math.ceil(rows.length / pageSize);
  const shown = [...rows]
    .reverse()
    .slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div className="daily-table" id="daily-data">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Daily activity data; scroll horizontally on small screens"
      >
        <table>
          <caption className="sr-only">
            Daily activity for the selected chains and dates, newest first.
            Dates are UTC.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date (UTC)</th>
              <th scope="col">Bounties</th>
              <th scope="col">Proofs</th>
              <th scope="col">Completed</th>
              <th scope="col">Wallets</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.date}>
                <th scope="row">{shortDate(row.date, true)}</th>
                <td>{number(row.bounties)}</td>
                <td>{number(row.claims)}</td>
                <td>{number(row.completed)}</td>
                <td>{number(row.wallets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          Page {page + 1} of {pageCount}
        </span>
        <div>
          <button
            className="button small"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            Newer
          </button>
          <button
            className="button small"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= pageCount}
          >
            Older
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const [chain, setChain] = useState<ChainFilter>("all");
  const [days, setDays] = useState(365);
  const [metric, setMetric] = useState<Metric>("bounties");
  const [grouping, setGrouping] = useState<"day" | "week">("day");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [announcement, setAnnouncement] = useState("");
  const dataDetails = useRef<HTMLDetailsElement>(null);
  const selected = useMemo(
    () => selectDaily(snapshot, chain, days),
    [snapshot, chain, days],
  );
  const daily = useMemo(() => aggregateDays(selected), [selected]);
  const totals = useMemo(() => summarize(selected), [selected]);
  const start = startForRange(snapshot.period.end, days);
  const activeDays = daily.filter((d) => d.wallets > 0).length;
  const peak = daily.reduce(
    (best, day) =>
      day.bounties + day.claims + day.completed >
      best.bounties + best.claims + best.completed
        ? day
        : best,
    daily[0],
  );
  const recent = snapshot.bounties
    .filter(
      (b) =>
        (chain === "all" || b.chain === chain) &&
        b.createdAt.slice(0, 10) >= start &&
        b.createdAt.slice(0, 10) <= snapshot.period.end,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const chainSummaries = snapshot.chains.map((c) => ({
    ...c,
    ...summarize(selectDaily(snapshot, c.id, days)),
  }));
  const allBounties = chainSummaries.reduce((sum, c) => sum + c.bounties, 0);
  const rangeName = ranges.find((r) => r.days === days)!.name;

  useEffect(() => {
    function openData() {
      if (
        ["#about-data", "#metric-definitions"].includes(window.location.hash) &&
        dataDetails.current
      ) {
        dataDetails.current.open = true;
        window.requestAnimationFrame(() =>
          document.querySelector(window.location.hash)?.scrollIntoView(),
        );
      }
    }
    openData();
    window.addEventListener("hashchange", openData);
    return () => window.removeEventListener("hashchange", openData);
  }, []);

  function changeChain(value: ChainFilter) {
    setChain(value);
    setAnnouncement(
      `Showing ${chainNames[value]}, ${rangeName.toLowerCase()}.`,
    );
  }
  function downloadCsv() {
    const csv = new Blob([toCsv(daily, chain)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(csv);
    const link = document.createElement("a");
    link.href = url;
    link.download = `poidh-${chain}-${start}-to-${snapshot.period.end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(
      `CSV exported: ${daily.length} daily rows for ${chainNames[chain]}.`,
    );
  }

  return (
    <>
      <section className="page-intro" aria-labelledby="page-title">
        <div>
          <div className="title-line">
            <h1 id="page-title">Protocol activity</h1>
            <span className="version-tag">v3</span>
          </div>
          <p>Bounties, proof, and participation across three chains.</p>
        </div>
        <div className="snapshot-label">
          <span className="snapshot-dot" />
          Saved snapshot{" "}
          <span className="snapshot-date">
            Through {shortDate(snapshot.period.end, true)} · UTC
          </span>
        </div>
      </section>

      <section className="filter-bar" aria-label="Dashboard filters">
        <div
          className="chain-filters"
          role="group"
          aria-label="Filter by chain"
        >
          {(["all", "ethereum", "arbitrum", "base"] as ChainFilter[]).map(
            (id) => (
              <button
                key={id}
                className={`chain-filter ${chain === id ? "selected" : ""}`}
                aria-pressed={chain === id}
                onClick={() => changeChain(id)}
              >
                {id === "all" ? (
                  <Icon name="grid" size={16} />
                ) : (
                  <ChainIcon chain={id} />
                )}
                {chainNames[id]}
              </button>
            ),
          )}
        </div>
        <div className="range-actions">
          <label className="range-select">
            <Icon name="calendar" />
            <span className="sr-only">Date range</span>
            <select
              value={days}
              onChange={(e) => {
                const value = Number(e.target.value);
                setDays(value);
                setAnnouncement(
                  `Showing ${chainNames[chain]}, ${ranges.find((r) => r.days === value)!.name.toLowerCase()}.`,
                );
              }}
            >
              {ranges.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" onClick={downloadCsv}>
            <Icon name="download" />
            Export CSV
          </button>
        </div>
      </section>
      <div className="period-line">
        <span>
          {shortDate(start, true)} – {shortDate(snapshot.period.end, true)}
        </span>
        <span>All dates in UTC</span>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <section className="metrics-grid" aria-label="Activity summary">
        <MetricCard
          title="Bounties created"
          value={totals.bounties}
          detail="New opportunities posted"
          icon="bounty"
        />
        <MetricCard
          title="Proofs submitted"
          value={totals.claims}
          detail="Claims with proof of work"
          icon="camera"
        />
        <MetricCard
          title="Bounties completed"
          value={totals.completed}
          detail="Winning claims accepted"
          icon="check"
        />
        <MetricCard
          title="Active wallets"
          value={totals.wallets}
          detail="Unique addresses, all selected days"
          icon="wallet"
        />
      </section>

      <section
        className="panel activity-panel"
        aria-labelledby="activity-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="activity-title">Activity over time</h2>
            <p>
              {chainNames[chain]} ·{" "}
              {view === "table" || grouping === "day"
                ? "Daily counts"
                : "Weekly totals"}
            </p>
          </div>
          <div className="view-controls" role="group" aria-label="Data display">
            <button
              aria-pressed={view === "chart"}
              className={view === "chart" ? "active" : ""}
              onClick={() => setView("chart")}
            >
              <Icon name="chart" size={16} />
              Chart
            </button>
            <button
              aria-pressed={view === "table"}
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              <Icon name="grid" size={16} />
              Table
            </button>
          </div>
        </div>
        {view === "chart" ? (
          <>
            <div className="chart-controls">
              <div
                className="metric-switch"
                role="group"
                aria-label="Chart metric"
              >
                {metrics.map((m) => (
                  <button
                    key={m}
                    aria-pressed={metric === m}
                    className={metric === m ? "active" : ""}
                    onClick={() => {
                      setMetric(m);
                      setAnnouncement(`Chart metric: ${metricLabels[m]}.`);
                    }}
                  >
                    {metricLabels[m]}
                  </button>
                ))}
              </div>
              <label className="grouping-select">
                <span className="sr-only">Group chart by</span>
                <select
                  value={grouping}
                  onChange={(e) =>
                    setGrouping(e.target.value as "day" | "week")
                  }
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                </select>
              </label>
            </div>
            <ActivityChart rows={daily} metric={metric} grouping={grouping} />
          </>
        ) : (
          <DailyTable key={`${chain}-${days}`} rows={daily} />
        )}
        <div className="chart-footnote">
          <Icon name="info" size={16} />
          <span>
            v3 contracts only. First indexed activity: Base & Arbitrum, Jan
            2026; Ethereum, May 2026.
          </span>
        </div>
      </section>

      <section className="lower-grid" aria-label="Activity breakdown">
        <div className="panel chain-panel">
          <div className="panel-heading">
            <div>
              <h2>Across the chains</h2>
              <p>Compare all three · {rangeName.toLowerCase()}</p>
            </div>
            <span className="quiet-tag">Bounty share</span>
          </div>
          <div
            className="chain-table-wrap"
            role="region"
            tabIndex={0}
            aria-label="Activity by chain; scroll horizontally if needed"
          >
            <table className="chain-table">
              <caption className="sr-only">
                Activity by chain. This comparison always shows all three chains
                for the selected date range.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Chain</th>
                  <th scope="col">Bounties</th>
                  <th scope="col">Proofs</th>
                  <th scope="col">Completed</th>
                </tr>
              </thead>
              <tbody>
                {chainSummaries.map((c) => (
                  <tr
                    key={c.id}
                    className={chain === c.id ? "highlight-row" : ""}
                  >
                    <th scope="row">
                      <button
                        className="chain-row-button"
                        onClick={() => changeChain(c.id)}
                        aria-label={`Filter dashboard to ${c.name}`}
                      >
                        <ChainIcon chain={c.id} />
                        <span>
                          {chainNames[c.id]}
                          <span className="chain-share">
                            <span className={`share-track ${c.id}`}>
                              <span
                                style={{
                                  width: `${allBounties ? (c.bounties / allBounties) * 100 : 0}%`,
                                }}
                              />
                            </span>
                            <span>
                              {allBounties
                                ? Math.round((c.bounties / allBounties) * 100)
                                : 0}
                              %
                            </span>
                          </span>
                        </span>
                      </button>
                    </th>
                    <td>{number(c.bounties)}</td>
                    <td>{number(c.claims)}</td>
                    <td>{number(c.completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel rhythm-panel">
          <div className="panel-heading">
            <div>
              <h2>The bigger picture</h2>
              <p>{chainNames[chain]} · Selected period</p>
            </div>
            <span className="rhythm-icon">
              <Icon name="chart" size={20} />
            </span>
          </div>
          <dl className="insights">
            <div>
              <dt>Days with wallet activity</dt>
              <dd>
                {number(activeDays)} <span>/ {days}</span>
              </dd>
            </div>
            <div>
              <dt>
                Proofs per bounty created{" "}
                <a
                  href="#metric-definitions"
                  aria-label="Read how proofs per bounty is calculated"
                >
                  <Icon name="info" size={14} />
                </a>
              </dt>
              <dd>
                {totals.bounties
                  ? (totals.claims / totals.bounties).toFixed(1)
                  : "N/A"}
              </dd>
            </div>
            <div>
              <dt>
                Most active day{" "}
                <small>By bounties, proofs, and completions</small>
              </dt>
              <dd>
                {peak && peak.bounties + peak.claims + peak.completed > 0
                  ? shortDate(peak.date)
                  : "No activity"}
              </dd>
            </div>
          </dl>
          <p className="insight-note">
            <span className="little-camera">
              <Icon name="camera" size={16} />
            </span>
            A winning claim turns a submission into a completed bounty.
          </p>
        </div>
      </section>

      <section className="panel recent-panel" aria-labelledby="recent-title">
        <div className="panel-heading">
          <div>
            <h2 id="recent-title">Behind the numbers</h2>
            <p>The latest bounties created in this window.</p>
          </div>
          <a
            className="text-link"
            href="https://poidh.xyz/"
            target="_blank"
            rel="noreferrer"
          >
            Explore poidh <Icon name="arrow" size={16} />
          </a>
        </div>
        {recent.length ? (
          <ul className="bounty-list">
            {recent.map((b) => (
              <li key={`${b.chain}-${b.id}`}>
                <div className="bounty-chain">
                  <ChainIcon chain={b.chain} />
                </div>
                <div className="bounty-main">
                  <a href={b.url} target="_blank" rel="noreferrer">
                    {b.name}
                    <Icon name="arrow" size={16} />
                  </a>
                  <span>
                    {chainNames[b.chain]} <span aria-hidden="true">·</span>{" "}
                    {shortDate(b.createdAt, true)}{" "}
                    <span aria-hidden="true">·</span> #{b.id}
                  </span>
                </div>
                <span className={`status-tag ${b.status}`}>
                  <span className="status-dot" />
                  {b.status === "open"
                    ? "Open"
                    : b.status === "completed"
                      ? "Completed"
                      : "Canceled"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <Icon name="bounty" size={24} />
            <h3>No new bounties in this window</h3>
            <p>Choose a longer date range to explore earlier activity.</p>
            <button className="button" onClick={() => setDays(365)}>
              Show last 12 months
            </button>
          </div>
        )}
        <p className="recent-note">
          Status is recorded at snapshot time. Open a bounty for its current
          state.
        </p>
      </section>

      <details id="about-data" className="data-details" ref={dataDetails}>
        <summary>
          <span>
            <Icon name="info" />
            About this data
          </span>
          <span>
            Sources & methodology <Icon name="chevron" size={16} />
          </span>
        </summary>
        <div className="data-content">
          <p>
            This dashboard combines a saved snapshot from the{" "}
            <a
              href="https://indexer.poidh.xyz/swagger"
              target="_blank"
              rel="noreferrer"
            >
              poidh public indexer
            </a>
            . It covers {shortDate(snapshot.period.start, true)} through{" "}
            {shortDate(snapshot.period.end, true)}, using complete UTC days.
            Fetched {shortDate(snapshot.generatedAt, true)} at{" "}
            {snapshot.generatedAt.slice(11, 16)} UTC. The snapshot does not
            update automatically.
          </p>
          <h3 id="metric-definitions">What the numbers mean</h3>
          <dl className="definitions">
            <div>
              <dt>Bounties created</dt>
              <dd>New bounties indexed on their creation date.</dd>
            </div>
            <div>
              <dt>Proofs submitted</dt>
              <dd>
                Claim creation events. A submission is not necessarily accepted
                or valid proof.
              </dd>
            </div>
            <div>
              <dt>Bounties completed</dt>
              <dd>
                Indexed winning-claim acceptance events, counted on the
                acceptance date.
              </dd>
            </div>
            <div>
              <dt>Active wallets</dt>
              <dd>
                Distinct valid wallet addresses associated with indexed protocol
                events. Deduplicated across selected days and chains; these are
                addresses, not people or guaranteed transaction senders.
              </dd>
            </div>
            <div>
              <dt>Proofs per bounty</dt>
              <dd>
                Proofs submitted divided by bounties created in the selected
                window. Claims can refer to older bounties; this is not a
                conversion rate.
              </dd>
            </div>
          </dl>
          <h3>The contracts in view</h3>
          <p>
            These are the three v3 deployments requested. Legacy v2 and Degen
            Chain records are excluded. Earlier days with no indexed v3 activity
            remain zero.
          </p>
          <ul className="contract-list">
            {snapshot.chains.map((c) => (
              <li key={c.id}>
                <span>
                  <ChainIcon chain={c.id} />
                  <strong>{c.name}</strong>
                </span>
                <a
                  href={`${c.explorer}/address/${c.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <code>{c.address}</code>
                  <Icon name="arrow" size={16} />
                </a>
                <small>
                  First indexed activity:{" "}
                  {c.firstActivity
                    ? shortDate(c.firstActivity, true)
                    : "Unavailable"}
                </small>
              </li>
            ))}
          </ul>
          <h3>Coverage & limitations</h3>
          <ul className="limitations">
            {snapshot.source.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
          <p>
            The indexer is a derived data source. Contract state remains
            authoritative. This dashboard does not estimate ETH deposits,
            payouts, revenue, or USD values.
          </p>
          <div className="data-links">
            <a href="./data/activity.json" download>
              Download source snapshot <Icon name="download" size={16} />
            </a>
            <a
              href="https://github.com/picsoritdidnthappen/poidh-app/blob/prod/SKILL.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the poidh protocol guide <Icon name="arrow" size={16} />
            </a>
          </div>
        </div>
      </details>
      <footer className="site-footer">
        <span>
          <strong>poidh</strong> <span>pics or it didn’t happen</span>
        </span>
        <span>Independent analytics · Public data · No wallet needed</span>
      </footer>
    </>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: "bounty" | "camera" | "check" | "wallet";
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        <h2>{title}</h2>
        <Icon name={icon} size={18} />
      </div>
      <p className="metric-value">{number(value)}</p>
      <p className="metric-detail">{detail}</p>
    </div>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("./data/activity.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Snapshot could not be loaded.");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        validateSnapshot(data);
        setSnapshot(data);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to dashboard
      </a>
      <Header />
      <main id="main-content" className="main-container">
        {snapshot ? (
          <Dashboard snapshot={snapshot} />
        ) : (
          <section className="loading-state" aria-live="polite">
            <Icon name={error ? "info" : "chart"} size={32} />
            <h1>
              {error
                ? "Activity could not be loaded"
                : "Loading protocol activity"}
            </h1>
            <p>
              {error
                ? "The saved snapshot is unavailable. Try loading it again."
                : "Opening the saved snapshot for Ethereum, Arbitrum, and Base."}
            </p>
            {error && (
              <button
                className="button primary"
                onClick={() => setAttempt((a) => a + 1)}
              >
                Try again
              </button>
            )}
          </section>
        )}
      </main>
    </>
  );
}
