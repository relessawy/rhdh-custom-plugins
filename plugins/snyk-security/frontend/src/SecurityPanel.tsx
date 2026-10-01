import React, { useState, useEffect } from "react";
export type Summary = {
  entityRef: string;
  commit: string;
  buildNumber: string;
  observedAt: string;
  stale: boolean;
  gate: string;
  buildResult?: string;
  jenkinsUrl?: string;
  scans: any[];
};
export function safeLink(value?: string) {
  try {
    const u = new URL(value || "");
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
const labels: any = {
  code: "Source code",
  dependencies: "Dependencies",
  container: "Container image",
};
export function SecurityPanel({
  entityRef,
  load,
}: {
  entityRef: string;
  load: (ref: string) => Promise<Summary>;
}) {
  const [data, setData] = useState<Summary>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("dependencies");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    load(entityRef)
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active)
          setError(
            "Security evidence unavailable. No successful scan is implied."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entityRef, load, revision]);
  const scan = data?.scans.find((s: any) => s.kind === selected);
  return (
    <section className="snyk-security">
      <style>{`.snyk-security{padding:28px;max-width:1400px;margin:auto}.snyk-security h2{font-size:28px;margin:8px 0}.snyk-security .muted{opacity:.7;font-size:14px}.snyk-security .top{display:flex;justify-content:space-between;gap:20px;align-items:center}.snyk-security button{background:transparent;color:inherit;border:1px solid #87959d;border-radius:8px;padding:10px 16px;cursor:pointer}.snyk-security button:focus-visible{outline:3px solid #168577}.snyk-security .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.snyk-security .card{padding:20px;border:1px solid #87959d66;border-radius:12px;text-align:left}.snyk-security .card[aria-pressed=true]{border:2px solid #168577}.snyk-security .status{display:block;margin:12px 0;font-weight:bold}.snyk-security .BLOCKED,.snyk-security .ERROR{color:#b54727}.snyk-security .PASSED{color:#168577}.snyk-security .notice{padding:14px;background:#cb743a15;border-radius:8px;margin:16px 0}.snyk-security table{width:100%;border-collapse:collapse;font-size:13px}.snyk-security td,.snyk-security th{padding:12px;text-align:left;border-bottom:1px solid #87959d44;vertical-align:top}.snyk-security code{overflow-wrap:anywhere}.snyk-security .scroll{overflow:auto}.snyk-security .eyebrow{color:#168577;text-transform:uppercase;font-size:12px;letter-spacing:1.5px}@media(max-width:700px){.snyk-security .cards{grid-template-columns:1fr}.snyk-security{padding:16px}}`}</style>
      <div className="top">
        <div>
          <span className="eyebrow">Security · Snyk via Jenkins</span>
          <h2>Review before release</h2>
          <p className="muted">Scan evidence for {entityRef}</p>
        </div>
        <button disabled={loading} onClick={() => setRevision((x) => x + 1)}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading scan evidence…</p>}
      {data && (
        <>
          <p className="muted">
            Commit <code>{data.commit.slice(0, 12)}</code> · Scanned{" "}
            {new Date(data.observedAt).toLocaleString()} ·{" "}
            {data.buildNumber
              ? `Build ${data.buildNumber}`
              : "Recorded evidence"}
          </p>
          {data.stale && (
            <p className="notice">
              This report is more than 24 hours old. It is historical evidence,
              not current release approval.
            </p>
          )}
          <p className="notice">
            Scan policy: <strong>{data.gate}</strong>
            {data.buildResult && <> · Build: {data.buildResult}</>} · These scan
            results do not establish that publication or deployment completed.
          </p>
          {safeLink(data.jenkinsUrl) && (
            <a
              href={safeLink(data.jenkinsUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Jenkins build and full reports ↗
            </a>
          )}
          <div className="cards">
            {data.scans.map((s: any) => (
              <button
                key={s.kind}
                className="card"
                aria-pressed={selected === s.kind}
                onClick={() => setSelected(s.kind)}
              >
                <strong>{labels[s.kind]}</strong>
                <span className={`status ${s.status}`}>
                  {s.status.replace("_", " ")}
                </span>
                <span className="muted">
                  {s.status === "NOT_RUN"
                    ? "No evidence for this build"
                    : s.status === "ERROR"
                    ? "Scan could not complete"
                    : `${s.counts?.critical || 0} critical · ${
                        s.counts?.high || 0
                      } high · ${s.counts?.medium || 0} medium`}
                </span>
              </button>
            ))}
          </div>
          {scan && (
            <>
              <h3>{labels[scan.kind]} findings</h3>
              <p className="muted">
                {scan.threshold ? `Gate threshold: ${scan.threshold}. ` : ""}
                Results require review; counts across scan types may overlap.
              </p>
              {scan.error && <p className="notice">{scan.error}</p>}
              {scan.findings.length === 0 ? (
                <p className="notice">
                  {scan.status === "PASSED"
                    ? "No reported findings at this scan."
                    : scan.status === "NOT_RUN"
                    ? "This scan has not run for this build."
                    : "No completed findings available."}
                </p>
              ) : (
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Finding</th>
                        <th>Affected location</th>
                        <th>Suggested fixed versions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.findings.map((f: any, i: number) => (
                        <tr key={i}>
                          <td>{f.severity}</td>
                          <td>
                            <strong>{f.id}</strong>
                            <p>{f.title}</p>
                          </td>
                          <td>
                            <code>
                              {f.package ? `${f.package}@${f.version}` : f.file}
                              {f.line ? `:${f.line}` : ""}
                            </code>
                          </td>
                          <td>
                            {f.fixedIn?.length
                              ? f.fixedIn.join(", ")
                              : "Review required"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {scan.truncated && (
                <p>
                  Showing the first 200 findings. Full reports are retained in
                  Jenkins.
                </p>
              )}
            </>
          )}
          {data.scans.find((s: any) => s.kind === "container")
            ?.archiveSha256 && (
            <p className="muted">
              Scanned image archive SHA-256:{" "}
              <code>
                {
                  data.scans.find((s: any) => s.kind === "container")
                    ?.archiveSha256
                }
              </code>
            </p>
          )}
          <p className="muted">
            Reports describe the recorded build, not unscanned changes. The
            pipeline must enforce source and image gates before publication.
          </p>
        </>
      )}
    </section>
  );
}
