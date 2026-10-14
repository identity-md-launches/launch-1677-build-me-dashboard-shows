import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, MouseEvent } from "react";
import "./chart.css";

export type Metric = "bounties" | "claims" | "completed";

export interface ActivityRow {
  date: string;
  bounties: number;
  claims: number;
  completed: number;
  wallets: number;
}

export interface ActivityChartProps {
  rows: ActivityRow[];
  metric: Metric;
  grouping: "day" | "week";
}

export interface ActivityBucket {
  date: string;
  endDate: string;
  days: number;
  bounties: number;
  claims: number;
  completed: number;
}

const metricLabels: Record<Metric, string> = {
  bounties: "Bounties created",
  claims: "Proofs submitted",
  completed: "Bounties completed",
};
const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function dateValue(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

/** Monday-start UTC weeks, with the observed dates retained for partial edge weeks.
 * Wallet counts deliberately are not summed: daily distinct wallets are not weekly distinct wallets.
 */
export function aggregateWeeks(rows: ActivityRow[]): ActivityBucket[] {
  const weeks = new Map<string, ActivityBucket>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = dateValue(row.date);
    const weekday = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - weekday);
    const key = day.toISOString().slice(0, 10);
    const existing = weeks.get(key);
    if (existing) {
      existing.endDate = row.date;
      existing.days += 1;
      existing.bounties += row.bounties;
      existing.claims += row.claims;
      existing.completed += row.completed;
    } else {
      weeks.set(key, {
        date: row.date,
        endDate: row.date,
        days: 1,
        bounties: row.bounties,
        claims: row.claims,
        completed: row.completed,
      });
    }
  }
  return Array.from(weeks.values());
}

function tickStep(maximum: number): number {
  const raw = Math.max(1, maximum / 4);
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 5, 10].find((value) => value * power >= raw) ?? 10;
  return Math.max(1, factor * power);
}

function bucketDate(bucket: ActivityBucket, grouping: "day" | "week"): string {
  if (grouping === "day" || bucket.date === bucket.endDate) {
    return fullDateFormat.format(dateValue(bucket.date));
  }
  const start = dateValue(bucket.date);
  const end = dateValue(bucket.endDate);
  const first =
    start.getUTCFullYear() === end.getUTCFullYear()
      ? shortDateFormat.format(start)
      : fullDateFormat.format(start);
  return `${first} – ${fullDateFormat.format(end)}`;
}

export default function ActivityChart({
  rows,
  metric,
  grouping,
}: ActivityChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [width, setWidth] = useState(800);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const buckets = useMemo<ActivityBucket[]>(
    () =>
      grouping === "week"
        ? aggregateWeeks(rows)
        : [...rows]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((row) => ({
              date: row.date,
              endDate: row.date,
              days: 1,
              bounties: row.bounties,
              claims: row.claims,
              completed: row.completed,
            })),
    [rows, grouping],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () =>
      setWidth(Math.max(180, Math.round(frame.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const selectedMatch =
    selectedDate === null
      ? -1
      : buckets.findIndex(
          (bucket) =>
            selectedDate >= bucket.date && selectedDate <= bucket.endDate,
        );
  const selectedIndex = selectedMatch >= 0 ? selectedMatch : buckets.length - 1;
  const selected = buckets[selectedIndex];
  const height = width < 520 ? 220 : 250;
  const padding = { left: 38, right: 10, top: 18, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = buckets.reduce(
    (max, bucket) => Math.max(max, bucket[metric]),
    0,
  );
  const step = tickStep(maximum);
  const topValue = step * 4;
  const slotWidth = buckets.length ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.max(
    0.6,
    Math.min(44, slotWidth * (buckets.length > 100 ? 0.8 : 0.7)),
  );
  const xFor = (index: number) => padding.left + slotWidth * (index + 0.5);
  const yFor = (value: number) =>
    padding.top + plotHeight * (1 - value / topValue);
  const tickCount = Math.min(
    buckets.length,
    width < 440 ? 3 : width < 700 ? 5 : 7,
  );
  const xTicks = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, index) =>
        tickCount < 2
          ? 0
          : Math.round((index * (buckets.length - 1)) / (tickCount - 1)),
      ),
    ),
  );
  const isLongRange = rows.length > 100;
  const currentDescription = selected
    ? `${bucketDate(selected, grouping)}: ${numberFormat.format(selected[metric])} ${metricLabels[metric].toLowerCase()}`
    : "No daily records available";

  function inspectAt(clientX: number) {
    const frame = frameRef.current;
    if (!frame || !buckets.length) return;
    const localX = clientX - frame.getBoundingClientRect().left;
    const index = Math.max(
      0,
      Math.min(
        buckets.length - 1,
        Math.floor((localX - padding.left) / slotWidth),
      ),
    );
    setSelectedDate(buckets[index].date);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    // Touch scrolling stays native; a tap selects a bucket through onClick.
    if (event.pointerType === "mouse" || event.pointerType === "pen")
      inspectAt(event.clientX);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    inspectAt(event.clientX);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const changes: Record<string, number> = {
      ArrowLeft: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      ArrowDown: selectedIndex - 1,
      ArrowUp: selectedIndex + 1,
      Home: 0,
      End: buckets.length - 1,
    };
    if (!(event.key in changes) || !buckets.length) return;
    event.preventDefault();
    const index = Math.max(0, Math.min(buckets.length - 1, changes[event.key]));
    const bucket = buckets[index];
    setSelectedDate(bucket.date);
  }

  return (
    <div className="activity-chart">
      <div
        className="activity-chart__canvas"
        ref={frameRef}
        role={buckets.length ? "slider" : "img"}
        tabIndex={buckets.length ? 0 : undefined}
        aria-label={
          buckets.length
            ? `${metricLabels[metric]} by ${grouping}; select a ${grouping} to inspect`
            : `No daily records for ${metricLabels[metric].toLowerCase()}`
        }
        aria-describedby={helpId}
        aria-valuemin={buckets.length ? 1 : undefined}
        aria-valuemax={buckets.length || undefined}
        aria-valuenow={buckets.length ? selectedIndex + 1 : undefined}
        aria-valuetext={buckets.length ? currentDescription : undefined}
        aria-orientation={buckets.length ? "horizontal" : undefined}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((index) => {
            const value = index * step;
            const y = yFor(value);
            return (
              <g key={value}>
                <line
                  className="activity-chart__grid"
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="activity-chart__axis"
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {compactFormat.format(value)}
                </text>
              </g>
            );
          })}
          {selected && maximum > 0 && (
            <line
              className="activity-chart__guide"
              x1={xFor(selectedIndex)}
              x2={xFor(selectedIndex)}
              y1={padding.top - 4}
              y2={padding.top + plotHeight}
            />
          )}
          {buckets.map((bucket, index) => {
            const value = bucket[metric];
            if (!value) return null;
            const barHeight = Math.max(1, (plotHeight * value) / topValue);
            return (
              <rect
                key={bucket.date}
                className={`activity-chart__bar${index === selectedIndex ? " is-selected" : ""}`}
                x={xFor(index) - barWidth / 2}
                y={padding.top + plotHeight - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(2, barWidth / 3)}
              />
            );
          })}
          {selected && maximum > 0 && (
            <circle
              className="activity-chart__marker"
              cx={xFor(selectedIndex)}
              cy={yFor(selected[metric])}
              r="3.5"
            />
          )}
          {xTicks.map((index) => {
            const bucket = buckets[index];
            const date = dateValue(bucket.date);
            const label = isLongRange
              ? `${monthFormat.format(date)} '${String(date.getUTCFullYear()).slice(-2)}`
              : shortDateFormat.format(date);
            return (
              <text
                key={bucket.date}
                className="activity-chart__axis"
                x={xFor(index)}
                y={height - 10}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === buckets.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {label}
              </text>
            );
          })}
          {maximum === 0 && (
            <text
              className="activity-chart__empty"
              x={padding.left + plotWidth / 2}
              y={padding.top + plotHeight / 2}
              textAnchor="middle"
            >
              {buckets.length
                ? "No activity in this selection"
                : "No daily records available"}
            </text>
          )}
        </svg>
      </div>
      <div className="activity-chart__inspection">
        <div
          className="activity-chart__selection"
          data-testid="chart-selection"
        >
          <span className="activity-chart__selection-dot" aria-hidden="true" />
          {selected ? (
            <>
              <span className="activity-chart__date">
                {bucketDate(selected, grouping)}
              </span>
              <span className="activity-chart__value">
                <strong>{numberFormat.format(selected[metric])}</strong>{" "}
                {metricLabels[metric].toLowerCase()}
              </span>
              {grouping === "week" && selected.days < 7 && (
                <span className="activity-chart__partial">Partial week</span>
              )}
            </>
          ) : (
            <span>Choose another time range or chain.</span>
          )}
        </div>
        <p id={helpId} className="activity-chart__help">
          {buckets.length
            ? "Select a bar or use ← → keys to inspect."
            : "Try another time range or chain."}
        </p>
      </div>
    </div>
  );
}
