// Product lockup — used on home, console and driver surfaces.
// Working name "ITV Ops" — rename in one place when the final brand is chosen.

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#E8641B" />
      {/* container ribs */}
      <rect x="7" y="9" width="2.6" height="14" rx="1.3" fill="#fff" opacity="0.95" />
      <rect x="12" y="9" width="2.6" height="14" rx="1.3" fill="#fff" opacity="0.8" />
      <rect x="17" y="9" width="2.6" height="14" rx="1.3" fill="#fff" opacity="0.6" />
      {/* motion chevron */}
      <path d="M22 10.5 L27.5 16 L22 21.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 26 : 30} />
      <span className="leading-none">
        <span className={`block font-extrabold tracking-tight ${compact ? "text-[16px]" : "text-[19px]"} ${dark ? "text-white" : "text-[#1F3864]"}`}>
          ITV&nbsp;Ops
        </span>
        {!compact && (
          <span className={`block text-[9.5px] font-bold tracking-[0.18em] uppercase mt-0.5 ${dark ? "text-[#B9C6DE]" : "text-[#5C6B80]"}`}>
            Fleet · Equipment · Incentives
          </span>
        )}
      </span>
    </span>
  );
}
