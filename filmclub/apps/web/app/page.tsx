const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function HomePage() {
  const health = await fetch(`${apiBase}/health`, { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => ({ status: "offline" }));

  return (
    <main>
      <h1>filmclub</h1>
      <p>Companion app for movie nights. This is the starter environment.</p>
      <div className="card">
        <h2>API status</h2>
        <span className="pill">{String(health.status)}</span>
        <p>Using <code>{apiBase}</code></p>
      </div>
      <div className="card">
        <h2>Next Build Targets</h2>
        <p>1. Auth and group membership</p>
        <p>2. Movie-night records with trust confirmation</p>
        <p>3. Food orders and debt settlement ledger</p>
        <p>4. Ratings, stats, and history</p>
      </div>
    </main>
  );
}
