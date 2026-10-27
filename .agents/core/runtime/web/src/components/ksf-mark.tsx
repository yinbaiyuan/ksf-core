/** Balanced twin peaks rise from left to right above a shared, steady base. */
export function KsfMark({ size = 18 }: { size?: number }) {
  return <svg className="ksf-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2 20 7.5 8l3.5 5L17 4l5 16H2Z" />
  </svg>;
}

export function KsfLogo() {
  return <span className="ksf-logo" aria-hidden="true"><KsfMark size={22} /><strong>KSF</strong></span>;
}
