export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" role="status">
      {label}
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="state state--error" role="alert">
      Couldn’t load data: {error.message}
    </div>
  );
}
