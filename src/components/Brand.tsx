export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand--compact" : ""}`} href="/" aria-label="Kit Hub home">
      <span className="brand__mark" aria-hidden="true">
        <img src="/kit-hub-icon.svg" alt="" />
      </span>
      <span className="brand__words">
        <strong>Kit Hub</strong>
        {!compact && <small>Family Platform</small>}
      </span>
    </a>
  );
}
