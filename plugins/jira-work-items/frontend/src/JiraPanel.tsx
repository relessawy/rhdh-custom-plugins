import React, { useEffect, useState, useRef } from "react";
export function JiraPanel({
  entityRef,
  enabled,
  request,
}: {
  entityRef: string;
  enabled: boolean;
  request: (path: string, init?: any) => Promise<Response>;
}) {
  const ref = entityRef;
  const currentRef = useRef(ref);
  currentRef.current = ref;
  const [action, setAction] = useState<any>(),
    [selected, setSelected] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [noticeKind, setNoticeKind] = useState("success");
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [rev, setRev] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setData(undefined);
    setAction(undefined);
    setError("");
    if (!enabled) return;
    let active = true,
      timer: any;
    async function load() {
      setLoading(true);
      try {
        const r = await request(`/issues?entity=${encodeURIComponent(ref)}`);
        if (!r.ok)
          throw Error(
            r.status === 403
              ? "You do not have access to this application’s Jira issues."
              : "Jira is unavailable. Check connection, permissions or token expiry."
          );
        const value = await r.json();
        if (active) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(undefined);
          setError((e as Error).message);
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(load, 30000);
        }
      }
    }
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ref, enabled, request, rev]);
  async function openChange(issue: string) {
    setNotice("");
    setSaving(true);
    setAction(undefined);
    try {
      const r = await request(
        `/transitions?entity=${encodeURIComponent(
          ref
        )}&issue=${encodeURIComponent(issue)}`
      );
      const body = await r.json();
      if (!r.ok) throw Error(body.error || "Unable to load transitions");
      if (currentRef.current !== ref) return;
      setAction({ ...body, issue });
      setSelected("");
    } catch (e) {
      setNoticeKind("error");
      setNotice((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function changeStatus() {
    if (!action || !selected) return;
    setSaving(true);
    setNotice("");
    try {
      const r = await request(`/transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: ref,
          issue: action.issue,
          transition: selected,
          expectedStatus: action.expectedStatus,
          expectedUpdated: action.expectedUpdated,
        }),
      });
      const body = await r.json();
      if (!r.ok)
        throw Error(
          body.error || "Change unavailable. Refresh before retrying."
        );
      setNoticeKind("success");
      setNotice(
        `${action.issue} is now ${body.status}. Audit reference: ${body.requestId}.`
      );
    } catch (e) {
      setNoticeKind("error");
      setNotice((e as Error).message);
    } finally {
      setAction(undefined);
      setSaving(false);
      setRev((x) => x + 1);
    }
  }
  const statuses = Array.from(
    new Map<string, string>(
      (data?.issues || []).map(
        (i: any) => [i.status, i.category] as [string, string]
      )
    ).entries()
  ).sort(
    ([a, ac], [b, bc]) =>
      ["new", "indeterminate", "done"].indexOf(ac) -
        ["new", "indeterminate", "done"].indexOf(bc) || a.localeCompare(b)
  );
  if (!enabled)
    return <p>Jira has not been configured for this application.</p>;
  return (
    <section className="jira-work-items" aria-label="Jira work items">
      <style>{`.jira-work-items{padding:24px;border:1px solid #8598a555;border-radius:14px}.jira-work-items h2{font-size:26px;margin:6px 0}.jira-work-items .top{display:flex;justify-content:space-between;align-items:center;gap:16px}.jira-work-items .muted{opacity:.75;font-size:13px}.jira-work-items button{background:transparent;color:inherit;border:1px solid #87959d;border-radius:7px;padding:9px 16px;font:inherit;cursor:pointer}.jira-work-items .counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:24px 0}.jira-work-items .count{padding:18px;background:#2780c510;border:1px solid #87959d44;border-radius:10px}.jira-work-items .count strong{display:block;font-size:28px;margin-top:8px}.jira-work-items table{width:100%;border-collapse:collapse}.jira-work-items th,.jira-work-items td{text-align:left;padding:14px 12px;border-bottom:1px solid #87959d44}.jira-work-items a{color:#197ca3}.jira-work-items .badge{padding:5px 9px;border-radius:14px;white-space:nowrap;background:#87959d22}.jira-work-items .done{background:#22876320}.jira-work-items .indeterminate{background:#d79b2325}.jira-work-items button:focus-visible,.jira-work-items a:focus-visible,.jira-work-items select:focus-visible{outline:3px solid #2476c5;outline-offset:3px}.jira-work-items button:disabled{opacity:.5;cursor:not-allowed}.jira-work-items .editor{margin-top:24px;padding:24px;border:1px solid #59829a66;border-radius:14px;background:linear-gradient(135deg,#2476c50c,transparent);box-shadow:0 4px 16px #173f5208}.jira-work-items .editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.jira-work-items .eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;opacity:.7}.jira-work-items .editor h3{font-size:21px;margin:5px 0 0}.jira-work-items .current{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap}.jira-work-items .editor-controls{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:22px 0 18px}.jira-work-items .status-field{display:flex;flex-direction:column;gap:8px;flex:1;min-width:180px;max-width:360px;font-weight:600;font-size:13px}.jira-work-items select{font:inherit;font-size:15px;color:inherit;background:transparent;border:1px solid #87959d;border-radius:8px;padding:11px 36px 11px 12px;min-height:44px;width:100%}.jira-work-items .primary{background:#173f52;color:white;border-color:#173f52;min-height:44px;font-weight:600}.jira-work-items .secondary{min-height:44px}.jira-work-items .audit-note{border-top:1px solid #87959d33;padding-top:14px;font-size:12px;line-height:1.6;opacity:.75}.jira-work-items .notice{padding:14px 18px;border-radius:10px;border:1px solid #22876366;background:#22876310;overflow-wrap:anywhere}.jira-work-items .notice.error{border-color:#b33b3b66;background:#b33b3b10}.jira-work-items .empty-transition{padding:12px 0;line-height:1.6}@media(max-width:600px){.jira-work-items{padding:16px}.jira-work-items .editor{padding:18px}.jira-work-items .editor-head{flex-direction:column}.jira-work-items .status-field{max-width:none;width:100%;flex-basis:100%}}`}</style>
      <div className="top">
        <div>
          <span className="muted">APPLICATION DELIVERY · JIRA</span>
          <h2>Work behind the change</h2>
          <p>Follow the request from planned work to completion.</p>
        </div>
        <button disabled={loading} onClick={() => setRev((x) => x + 1)}>
          {loading ? "Updating…" : "Refresh"}
        </button>
      </div>
      {notice && (
        <p
          className={`notice ${noticeKind}`}
          role={noticeKind === "error" ? "alert" : "status"}
        >
          {notice}
        </p>
      )}
      {action && (
        <div className="editor" role="group" aria-label="Change Jira status">
          <div className="editor-head">
            <div>
              <span className="eyebrow">UPDATE WORK ITEM · {action.issue}</span>
              <h3>Move work forward</h3>
            </div>
            <div className="current">
              <span>Current status</span>
              <span className="badge">{action.status}</span>
            </div>
          </div>
          {action.transitions.length > 0 ? (
            <div className="editor-controls">
              <label className="status-field">
                New status
                <select
                  autoFocus
                  aria-label="New status"
                  value={selected}
                  disabled={saving}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Select a status…</option>
                  {action.transitions.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.to}
                      {action.transitions.filter((x: any) => x.to === t.to)
                        .length > 1
                        ? ` (via ${t.name})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={saving || !selected}
                onClick={changeStatus}
              >
                {saving ? "Updating…" : "Update status"}
              </button>
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setAction(undefined)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="empty-transition">
              <p>
                No other status is available here. Open the issue in Jira for
                workflows that require additional fields.
              </p>
              <button onClick={() => setAction(undefined)}>Close</button>
            </div>
          )}
          <div className="audit-note">
            Available statuses follow this issue’s Jira workflow. Changes use
            the shared Jira account; your RHDH identity is recorded for
            traceability.
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading Jira work items…</p>}
      {data && (
        <>
          <div className="counts">
            {statuses.map(([label]) => (
              <div className="count" key={label}>
                {label}
                <strong>
                  {data.issues.filter((i: any) => i.status === label).length}
                </strong>
              </div>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Work item</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Updated</th>
                  {data.canTransition && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.issues.map((i: any) => (
                  <tr key={i.key}>
                    <td>
                      <a href={i.url} target="_blank" rel="noopener noreferrer">
                        {i.key} ↗
                      </a>
                      <div>{i.summary}</div>
                    </td>
                    <td>
                      <span className={`badge ${i.category}`}>{i.status}</span>
                    </td>
                    <td>{i.assignee}</td>
                    <td>{i.priority}</td>
                    <td>
                      {i.updated
                        ? new Date(i.updated).toLocaleString()
                        : "Unavailable"}
                    </td>
                    {data.canTransition && (
                      <td>
                        <button
                          disabled={saving}
                          aria-label={`Change status for ${i.key}`}
                          onClick={() => openChange(i.key)}
                        >
                          Change status
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.issues.length && <p>No visible work items in this project.</p>}
          <p className="muted">
            Project {data.project} · Counts cover the displayed items (up to
            50). {data.more ? "More items are available in Jira. " : ""}Updated{" "}
            {new Date(data.observedAt).toLocaleTimeString()}. Refreshes every 30
            seconds.{" "}
            {data.canTransition
              ? "Use Change status to apply an available Jira workflow transition."
              : "You have read-only access to Jira issues."}
          </p>
        </>
      )}
    </section>
  );
}
