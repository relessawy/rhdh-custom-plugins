import React, { useEffect, useState } from "react";
export type CardId = "vault" | "jenkins" | "snyk" | "splunk";
export const titles: Record<CardId, string> = {
  vault: "Secrets · Vault",
  jenkins: "Delivery · Jenkins",
  snyk: "Security · Snyk",
  splunk: "Activity · Splunk",
};
export function configuredCards(annotations: Record<string, string>, enabled: string[]): CardId[] {
  const bindings: Record<CardId, string[]> = {
    vault: ["vault-health.io/vault-binding"],
    jenkins: ["jenkins.io/job-full-name"],
    snyk: ["demo-library.io/security-binding", "snyk-security.io/binding"],
    splunk: ["demo-library.io/splunk-binding", "splunk-logs.io/binding"],
  };
  return (Object.keys(bindings) as CardId[]).filter(id =>
    enabled.includes(id) && bindings[id].some(key => Boolean(annotations[key])));
}
export type CardData = {
  status: string;
  detail: string;
  observedAt?: string;
  bullets?: string[];
  href?: string;
};
export function preferenceKey(user: string, entity: string) {
  return `application-health:v1:${encodeURIComponent(
    user
  )}:${encodeURIComponent(entity)}`;
}
export function parseHidden(raw: string | null): CardId[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v)
      ? v.filter((x) => Object.prototype.hasOwnProperty.call(titles, x))
      : [];
  } catch {
    return [];
  }
}
export function Overview({
  ids,
  load,
  read,
  save,
}: {
  ids: CardId[];
  load: (id: CardId, window?: string) => Promise<CardData>;
  read: () => CardId[];
  save: (hidden: CardId[]) => boolean;
}) {
  const [hidden, setHidden] = useState<CardId[]>(read),
    [editing, setEditing] = useState(false),
    [notice, setNotice] = useState("");
  const update = (next: CardId[]) => {
    setHidden(next);
    setNotice(
      save(next)
        ? "Saved for you in this browser."
        : "Your browser could not save this preference. It applies until you leave this page."
    );
  };
  return (
    <section
      className="application-health"
      aria-label="Application health"
      style={{
        padding: 18,
        border: "1px solid #d9e2ec",
        borderRadius: 16,
        background: "var(--rhdh-health-background, #fff)",
        color: "#292524",
      }}
    >
      <style>{`.application-health button{font:inherit;font-size:13px;border:1px solid #d4d1d0;border-radius:6px;padding:6px 10px;background:#fff;color:#292524;cursor:pointer}.application-health button:hover{background:#f5f3f2;border-color:#837a76}.application-health button:focus-visible,.application-health a:focus-visible{outline:3px solid #3274ba;outline-offset:2px}.application-health a{color:inherit;font-weight:600;text-decoration:none}.application-health a:hover{text-decoration:underline}`}</style>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.2, color: "#516478" }}>
            APPLICATION OVERVIEW
          </div>
          <h2 style={{ margin: "8px 0" }}>Health and delivery</h2>
          <p style={{ marginTop: 0 }}>
            Your application signals, with evidence age and links to details.
          </p>
        </div>
        <button aria-expanded={editing} onClick={() => setEditing(!editing)}>
          Manage cards
        </button>
      </header>
      {editing && (
        <fieldset
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 10,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <legend>Choose what you see</legend>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {ids.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(id)}
                  onChange={(e) =>
                    update(
                      e.target.checked
                        ? hidden.filter((x) => x !== id)
                        : [...hidden, id]
                    )
                  }
                />
                {titles[id]}
              </label>
            ))}
          </div>
          <p>
            Choices apply to you and this application in this browser. They do
            not change access or integrations.
          </p>
          <button onClick={() => update([])}>Restore defaults</button>
        </fieldset>
      )}
      <div
        role="status"
        style={{ fontSize: 13, marginBottom: notice ? 12 : 0 }}
      >
        {notice}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr",
          gap: 16,
        }}
      >
        {ids
          .filter((id) => !hidden.includes(id))
          .map((id) => (
            <SignalCard
              key={id}
              id={id}
              load={load}
              hide={() => update([...hidden, id])}
            />
          ))}
      </div>
      {!ids.length && (
        <p>No application integrations are configured for this component.</p>
      )}
      {!!ids.length && ids.every((id) => hidden.includes(id)) && (
        <p>
          All cards are hidden. Use Manage cards or Restore defaults to bring
          them back.
        </p>
      )}
    </section>
  );
}
function SignalCard({
  id,
  load,
  hide,
}: {
  id: CardId;
  load: (id: CardId, window?: string) => Promise<CardData>;
  hide: () => void;
}) {
  const [data, setData] = useState<CardData | null>(null),
    [refresh, setRefresh] = useState(0), [window, setWindow] = useState("7d");
  useEffect(() => {
    let cancelled = false;
    const get = () =>
      load(id, window)
        .then((r) => {
          if (!cancelled) setData(r);
        })
        .catch(() => {
          if (!cancelled)
            setData({
              status: "Unavailable",
              detail:
                "Could not retrieve evidence. Open the integration details or try again.",
            });
        });
    get();
    const timer = setInterval(get, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, load, refresh, window]);
  return (
    <article
      aria-label={titles[id]}
      style={{
        border: "1px solid #d9e2ec",
        borderTop: "3px solid var(--rhdh-health-accent, #9f332b)",
        borderRadius: 12,
        padding: 18,
        background: "#faf9f8",
      }}
    >
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
      >
        <h3 style={{ margin: 0, fontSize: 17 }}>{titles[id]}</h3>
        <button aria-label={"Hide " + titles[id]} onClick={hide}>
          Hide
        </button>
      </header>
      {id === "splunk" && <label style={{display:"block",marginTop:14,fontSize:13}}>Time window <select aria-label="Splunk time window" value={window} onChange={e=>{setData(null);setWindow(e.target.value)}} style={{font:"inherit",padding:6,borderRadius:6,border:"1px solid #d4d1d0",background:"#fff",color:"#292524"}}>{[["5m","Last 5 minutes"],["15m","Last 15 minutes"],["1h","Last hour"],["6h","Last 6 hours"],["24h","Last 24 hours"],["7d","Last week"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
      {(!data || data.status) && <p style={{ fontSize: 18, fontWeight: 650, marginBottom: 8 }}>
        {data ? data.status : "Loading…"}
      </p>}
      {data?.bullets ? <ul style={{paddingLeft:20,fontSize:14,lineHeight:1.8}}>{data.bullets.map(line=><li key={line}>{line}</li>)}</ul> : <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}>{data?.detail}</p>}
      {data?.observedAt && (
        <p style={{ fontSize: 12, color: "#516478" }}>
          Observed {new Date(data.observedAt).toLocaleString()}
        </p>
      )}
      <footer style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <button onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
        {data?.href && /^\/(?!\/)/.test(data.href) && (
          <a href={data.href}>View details →</a>
        )}
      </footer>
    </article>
  );
}
