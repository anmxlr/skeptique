/** Loading placeholder: one status message for screen readers, and placeholder cards they skip. */
export function Skeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div role="status">
      <span className="visually-hidden">{label}…</span>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders never reorder
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}

/** A transient error shown over the page while the last good data stays visible. */
export function Toast({ message }: { message: string }) {
  return (
    <p role="alert" className="toast">
      {message}
    </p>
  );
}
