import React, { useEffect, useState } from "react";
export type Issue = {
  id: string;
  title: string;
  severity: string;
  status: string;
  ignored: boolean;
  type: string;
};
export type Project = {
  id: string;
  name: string;
  type: string;
  status: string;
  targetId: string;
  reference: string | null;
  url: string;
  issues: Issue[];
  partial: boolean;
  counts: Record<string, number>;
};
export type Summary = { projects: Project[]; observedAt: string };
const severities = ["critical", "high", "medium", "low", "info"];
export function safeLink(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function SecurityPanel({
  entityRef,
  load,
}: {
  entityRef: string;
  load: (ref: string) => Promise<Summary>;
}) {
  const [data, setData] = useState<Summary>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [severity, setSeverity] = useState("all");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(undefined);
    setError("");
    load(entityRef)
      .then((value) => {
        if (current) setData(value);
      })
      .catch(() => {
        if (current)
          setError(
            "Snyk data is unavailable. Check API access, configuration and backend logs. No successful scan is implied."
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [entityRef, load, revision]);
  return (
    <section className="snyk-security" aria-label="Snyk security">
      <style>{`
.snyk-security{padding:24px;border:1px solid #7c8a9855;border-radius:14px}.snyk-security h2{font-size:26px;margin:4px 0}.snyk-security h3{margin:0 0 8px}.snyk-security .header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.snyk-security .muted{opacity:.75;font-size:13px}.snyk-security .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin:20px 0}.snyk-security .metric{padding:16px;border:1px solid #7c8a9855;border-top:3px solid #617689;border-radius:8px}.snyk-security .metric strong{display:block;font-size:27px}.snyk-security .critical{border-color:#b4231855;border-top-color:#b42318}.snyk-security .high{border-color:#c6502255;border-top-color:#c65022}.snyk-security .medium{border-top-color:#b88616}.snyk-security button,.snyk-security select{font:inherit;color:inherit;background:transparent;border:1px solid #7c8a98;border-radius:7px;padding:8px 12px}.snyk-security button:focus-visible,.snyk-security select:focus-visible,.snyk-security a:focus-visible{outline:3px solid #3f91ca;outline-offset:2px}.snyk-security article{padding:20px;border:1px solid #7c8a9855;border-radius:10px;margin-top:20px}.snyk-security .notice{padding:14px;background:#c98c1918;border-radius:8px}.snyk-security .table-wrap{overflow:auto}.snyk-security table{width:100%;border-collapse:collapse;margin-top:16px;text-align:left}.snyk-security th,.snyk-security td{padding:12px 10px;border-bottom:1px solid #7c8a9844;vertical-align:top}.snyk-security .badge{display:inline-block;border:1px solid #7c8a9877;border-radius:20px;padding:3px 10px;font-size:12px;text-transform:capitalize}.snyk-security a{color:inherit;text-decoration:underline;text-underline-offset:3px}.snyk-security code{overflow-wrap:anywhere}
`}</style>
      <div className="header">
        <div>
          <div className="muted">APPLICATION SECURITY</div>
          <h2>Snyk findings</h2>
          <p>Open, non-ignored findings from the mapped Snyk projects.</p>
        </div>
        <button disabled={loading} onClick={() => setRevision((r) => r + 1)}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {loading && <p role="status">Loading Snyk project data…</p>}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.projects.some((p) => p.partial) && (
            <p className="notice" role="status">
              Partial results: up to 100 findings per project. Counts describe
              the findings shown here. Open Snyk for the complete results.
            </p>
          )}
          <div className="summary">
            {severities.map((s) => (
              <div key={s} className={`metric ${s}`}>
                <span style={{ textTransform: "capitalize" }}>{s}</span>
                <strong>
                  {data.projects.reduce((n, p) => n + (p.counts[s] || 0), 0)}
                </strong>
                <span className="muted">shown findings</span>
              </div>
            ))}
          </div>
          <label>
            Severity{" "}
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="all">All severities</option>
              {severities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {data.projects.map((p) => (
            <article key={p.id}>
              <div className="header">
                <div>
                  <h3>{p.name}</h3>
                  <span className="badge">{p.status}</span>{" "}
                  <span className="muted">
                    {p.type}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                </div>
                {safeLink(p.url) && (
                  <a
                    href={safeLink(p.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View project in Snyk ↗
                  </a>
                )}
              </div>
              <p className="muted">
                Target: <code>{p.targetId}</code> · Project activity is not a
                scan pass/fail result.
              </p>
              {p.issues.length === 0 ? (
                <p className="notice">
                  No open, non-ignored findings returned
                  {p.partial ? " in this page" : ""}. This does not establish
                  scan coverage or a clean release.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Severity</th>
                        <th scope="col">Finding</th>
                        <th scope="col">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.issues
                        .filter(
                          (i) => severity === "all" || i.severity === severity
                        )
                        .map((i) => (
                          <tr key={i.id}>
                            <td>
                              <span className="badge">{i.severity}</span>
                            </td>
                            <td>{i.title}</td>
                            <td>{i.type}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {severity !== "all" &&
                    !p.issues.some((i) => i.severity === severity) && (
                      <p>No displayed findings match this severity.</p>
                    )}
                </div>
              )}
            </article>
          ))}
          <p className="muted">
            Retrieved {new Date(data.observedAt).toLocaleString()}. Refresh
            manually for new results. This panel does not run scans.
          </p>
        </>
      )}
    </section>
  );
}
