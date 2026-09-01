// Shared admin-family primitives — Phase 5 Nocturne reconciliation

export function AdminSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--noc-blue)]/30 border-t-[var(--noc-blue)]" />
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

export function AdminCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] ${className}`}>
      {children}
    </div>
  );
}

export function AdminStatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--noc-t4)]">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent ?? 'var(--noc-t1)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--noc-t5)]">{sub}</div>}
    </div>
  );
}
