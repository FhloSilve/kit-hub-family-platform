export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`} aria-label="Kit Hub">
      <span className="brand__mark" aria-hidden="true">
        <img src="/kit-hub-icon.svg" alt="" />
      </span>
      <span className="brand__words">
        <strong>Kit Hub</strong>
        {!compact && <small>Family Platform</small>}
      </span>
    </div>
  );
}
