import { HouseHeart } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`} aria-label="Kit Hub">
      <span className="brand__mark" aria-hidden="true">
        <HouseHeart strokeWidth={2.2} />
      </span>
      <span className="brand__words">
        <strong>Kit Hub</strong>
        {!compact && <small>Family Platform</small>}
      </span>
    </div>
  );
}
