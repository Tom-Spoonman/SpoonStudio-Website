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
        <h2>Build Status</h2>
        <p>1. Auth and club membership: implemented (phase 1)</p>
        <p>2. Movie-night records with trust confirmation: next</p>
        <p>3. Food orders and debt settlement ledger: planned</p>
        <p>4. Ratings, stats, and history: planned</p>
      </div>
    </main>
  );
}
