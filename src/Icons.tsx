type IconName =
  | "arrow"
  | "download"
  | "calendar"
  | "camera"
  | "check"
  | "wallet"
  | "bounty"
  | "info"
  | "chevron"
  | "grid"
  | "chart";
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M7 17 17 7M7 7h10v10" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4m8-4v4M4 11h16" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h5l2-3h4l2 3h5v14H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V4H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V6" />
      <path d="M21 12h-6v4h6" />
    </>
  ),
  bounty: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v3H9zM9 11h6m-6 5h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M10 4v16M4 15h16" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8V9m4 6V5" />
    </>
  ),
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function ChainIcon({ chain }: { chain: string }) {
  return (
    <span className={`chain-icon ${chain}`} aria-hidden="true">
      {chain === "ethereum" ? (
        <svg viewBox="0 0 24 24">
          <path d="m12 2 6 10-6 4-6-4zM6 14l6 8 6-8-6 4z" fill="currentColor" />
        </svg>
      ) : chain === "arbitrum" ? (
        <svg viewBox="0 0 24 24">
          <path
            d="m12 2 9 5v10l-9 5-9-5V7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m7 16 5-9m0 10 4-7m-1 7 3-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="currentColor" />
          <path d="M2 12h13" stroke="white" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}
