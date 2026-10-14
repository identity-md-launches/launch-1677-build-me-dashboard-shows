export type ChainId = "ethereum" | "arbitrum" | "base";
export type ChainFilter = ChainId | "all";
export type Metric = "bounties" | "claims" | "completed";
export type Daily = {
  date: string;
  chain: ChainId;
  bounties: number;
  claims: number;
  completed: number;
  wallets: string[];
};
export type Chain = {
  id: ChainId;
  chainId: number;
  name: string;
  address: string;
  explorer: string;
  frontendOffset: number;
  firstActivity: string | null;
  lastActivity: string | null;
};
export type Bounty = {
  id: number;
  onChainId: number;
  chain: ChainId;
  name: string;
  createdAt: string;
  amountEth: string;
  status: "open" | "completed" | "canceled";
  url: string;
  claims: number;
};
export type Snapshot = {
  schemaVersion: number;
  generatedAt: string;
  period: { start: string; end: string; timezone: string };
  source: {
    name: string;
    url: string;
    docsUrl: string;
    skillUrl: string;
    method: string;
    limitations: string[];
  };
  chains: Chain[];
  daily: Daily[];
  bounties: Bounty[];
};
export type DailyTotal = {
  date: string;
  bounties: number;
  claims: number;
  completed: number;
  wallets: number;
};
export const metricLabels: Record<Metric, string> = {
  bounties: "Bounties",
  claims: "Proofs",
  completed: "Completed",
};
export const chainNames: Record<ChainFilter, string> = {
  all: "All chains",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
};
export const number = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
export const shortDate = (date: string, year = false) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
export function startForRange(end: string, days: number): string {
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}
export function selectDaily(
  snapshot: Snapshot,
  chain: ChainFilter,
  days: number,
): Daily[] {
  const start = startForRange(snapshot.period.end, days);
  return snapshot.daily.filter(
    (row) =>
      (chain === "all" || row.chain === chain) &&
      row.date >= start &&
      row.date <= snapshot.period.end,
  );
}
export function aggregateDays(rows: Daily[]): DailyTotal[] {
  const days = new Map<
    string,
    {
      date: string;
      bounties: number;
      claims: number;
      completed: number;
      wallets: Set<string>;
    }
  >();
  for (const row of rows) {
    const day = days.get(row.date) ?? {
      date: row.date,
      bounties: 0,
      claims: 0,
      completed: 0,
      wallets: new Set<string>(),
    };
    day.bounties += row.bounties;
    day.claims += row.claims;
    day.completed += row.completed;
    row.wallets.forEach((wallet) => day.wallets.add(wallet.toLowerCase()));
    days.set(row.date, day);
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ ...day, wallets: day.wallets.size }));
}
export function summarize(rows: Daily[]) {
  const wallets = new Set<string>();
  const total = { bounties: 0, claims: 0, completed: 0, wallets: 0 };
  rows.forEach((row) => {
    total.bounties += row.bounties;
    total.claims += row.claims;
    total.completed += row.completed;
    row.wallets.forEach((wallet) => wallets.add(wallet.toLowerCase()));
  });
  total.wallets = wallets.size;
  return total;
}
export function toCsv(rows: DailyTotal[], chain: ChainFilter): string {
  return (
    [
      "date_utc,chain,bounties_created,proofs_submitted,bounties_completed,unique_active_wallets",
      ...rows.map(
        (r) =>
          `${r.date},${chain},${r.bounties},${r.claims},${r.completed},${r.wallets}`,
      ),
    ].join("\r\n") + "\r\n"
  );
}
export function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (!value || typeof value !== "object")
    throw new Error("Snapshot is missing.");
  const data = value as Snapshot;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    data.schemaVersion !== 1 ||
    !data.period ||
    !datePattern.test(data.period.start) ||
    !datePattern.test(data.period.end) ||
    !Array.isArray(data.daily) ||
    !Array.isArray(data.chains) ||
    !Array.isArray(data.bounties) ||
    !data.source ||
    !Array.isArray(data.source.limitations)
  )
    throw new Error("Snapshot format is invalid.");
  if (data.chains.length !== 3 || data.daily.length !== 1095)
    throw new Error("Snapshot coverage is incomplete.");
  const keys = new Set<string>();
  for (const row of data.daily) {
    if (
      !datePattern.test(row.date) ||
      !["ethereum", "arbitrum", "base"].includes(row.chain) ||
      ![row.bounties, row.claims, row.completed].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      !Array.isArray(row.wallets) ||
      !row.wallets.every(
        (w) => typeof w === "string" && /^0x[a-f\d]{40}$/i.test(w),
      )
    )
      throw new Error("Snapshot contains an invalid daily row.");
    if (
      row.date < data.period.start ||
      row.date > data.period.end ||
      keys.has(`${row.chain}:${row.date}`)
    )
      throw new Error("Snapshot dates are inconsistent.");
    keys.add(`${row.chain}:${row.date}`);
  }
}
