import React, { useState, useEffect } from "react";
const windows = [
  ["5m", "Last 5 minutes"],
  ["15m", "Last 15 minutes"],
  ["1h", "Last hour"],
  ["6h", "Last 6 hours"],
  ["24h", "Last 24 hours"],
  ["7d", "Last 7 days"],
];
const styles = `
.splunk-logs{padding:28px;max-width:1400px;margin:auto;color:inherit;font:inherit}
.splunk-logs *{box-sizing:border-box}.splunk-logs h2{font-size:26px;margin:8px 0;letter-spacing:-.5px}.splunk-logs p{margin:8px 0;line-height:1.5}.splunk-logs .muted{opacity:.7;font-size:14px}
.splunk-logs .eyebrow{text-transform:uppercase;letter-spacing:1.8px;font-size:11px;font-weight:700;color:#168577}.splunk-logs .toolbar{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:24px}.splunk-logs .controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}
.splunk-logs label{font-size:12px;font-weight:600;display:grid;gap:6px}.splunk-logs select,.splunk-logs button{font:inherit;font-size:14px;border:1px solid #87959d;border-radius:8px;padding:10px 14px;background:transparent;color:inherit;min-height:42px}.splunk-logs button{background:#174558;color:white;border-color:#174558;cursor:pointer;font-weight:600}.splunk-logs button:disabled{opacity:.55;cursor:wait}.splunk-logs :focus-visible{outline:3px solid #159b90;outline-offset:3px}
.splunk-logs .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:24px 0}.splunk-logs .metric{border:1px solid #89979f55;border-radius:12px;padding:22px;border-top:3px solid #168577;background:linear-gradient(135deg,#16857709,transparent)}.splunk-logs .metric dt{font-size:14px;opacity:.8}.splunk-logs .metric dd{font-size:36px;font-weight:700;margin:10px 0;letter-spacing:-1px}.splunk-logs .metric small{font-size:12px;opacity:.7}.splunk-logs .metric.error{border-top-color:#cb743a}
.splunk-logs .panel{border:1px solid #89979f55;border-radius:12px;overflow:hidden}.splunk-logs .panel-title{padding:20px 22px;border-bottom:1px solid #89979f33;display:flex;align-items:center;justify-content:space-between;gap:12px}.splunk-logs h3{font-size:18px;margin:0}.splunk-logs .badge{font-size:12px;border-radius:20px;padding:5px 10px;background:#16857715;color:inherit}.splunk-logs .scroll{overflow-x:auto}.splunk-logs table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}.splunk-logs th{font-weight:600;background:#89979f0e}.splunk-logs th,.splunk-logs td{padding:15px 22px;border-bottom:1px solid #89979f26}.splunk-logs tbody tr:hover{background:#16857708}.splunk-logs code{font-size:12px;overflow-wrap:anywhere}.splunk-logs .status{color:#b54d22;background:#cb743a15;padding:4px 8px;border-radius:5px;font-weight:700}.splunk-logs .empty{padding:38px 24px;text-align:center}.splunk-logs .empty strong{display:block;font-size:17px;margin-bottom:8px}.splunk-logs .notice{padding:16px;border-radius:8px;background:#cb743a12;margin:16px 0}.splunk-logs footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:18px}.splunk-logs .loading{padding:24px;opacity:.7}
@media(max-width:650px){.splunk-logs{padding:16px}.splunk-logs .metrics{grid-template-columns:1fr}.splunk-logs .metric dd{font-size:30px}.splunk-logs th,.splunk-logs td{padding:12px}.splunk-logs .controls{width:100%}}
`;
export function SplunkPanel({
  entity,
  load,
}: {
  entity: any;
  load: (window: string) => Promise<any>;
}) {
  const [window, setWindow] = useState("24h");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setData(null);
    (async () => {
      try {
        const value = await load(window);
        if (active) setData(value);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [entity, window, revision, load]);
  return (
    <section className="splunk-logs" aria-label="Application observability">
      <style>{styles}</style>
      <div className="toolbar">
        <div>
          <span className="eyebrow">Observability · Splunk</span>
          <h2>Application activity</h2>
          <p className="muted">
            Explore request health and investigate errors for{" "}
            {entity.metadata.title || entity.metadata.name}.
          </p>
        </div>
        <div className="controls">
          <label>
            Time window
            <select value={window} onChange={(e) => setWindow(e.target.value)}>
              {windows.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => setRevision((x) => x + 1)}>
            {busy ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>
      {busy && (
        <div role="status" className="loading">
          Loading application activity…
        </div>
      )}
      {error && (
        <div role="alert" className="notice">
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="muted">
            {windows.find(([v]) => v === window)?.[1]}{" "}
            <span aria-hidden="true"> · </span>
            <span className="badge">Environment: {data.environment}</span>
          </div>
          <dl className="metrics">
            <div className="metric">
              <dt>Total requests</dt>
              <dd>{data.requests.toLocaleString()}</dd>
              <small>Unique completed requests</small>
            </div>
            <div className="metric error">
              <dt>Server errors</dt>
              <dd>{data.errors.toLocaleString()}</dd>
              <small>HTTP 500–599 responses</small>
            </div>
            <div className="metric">
              <dt>Error rate</dt>
              <dd>{data.requests ? `${data.errorRate}%` : "—"}</dd>
              <small>
                {data.requests
                  ? "Share of requests with server errors"
                  : "No requests in the selected window"}
              </small>
            </div>
          </dl>
          <div className="panel">
            <div className="panel-title">
              <h3>Recent errors</h3>
              <span className="badge">
                Latest {data.recentErrors.length} · up to 20
              </span>
            </div>
            {data.recentErrors.length === 0 ? (
              <div className="empty">
                <strong>
                  {data.requests
                    ? "No server errors in this window"
                    : "No request activity yet"}
                </strong>
                <p className="muted">
                  {data.requests
                    ? "Completed requests in this period returned no HTTP 5xx responses."
                    : "Try a wider time window, or use the application and refresh."}
                </p>
              </div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Service</th>
                      <th scope="col">HTTP status</th>
                      <th scope="col">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.map((e: any, i: number) => (
                      <tr key={`${e.requestId}-${i}`}>
                        <td>{new Date(e.time).toLocaleString()}</td>
                        <td>{e.service}</td>
                        <td>
                          <span className="status">{e.status}</span>
                        </td>
                        <td>
                          <code>{e.requestId}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <footer className="muted">
            <span>
              Splunk · Updated {new Date(data.observedAt).toLocaleString()}
            </span>
            <span>Ingestion may take several seconds.</span>
          </footer>
          <p className="muted">
            Available history depends on index retention and ingestion. The
            largest search window is seven days.
          </p>
        </>
      )}
    </section>
  );
}
