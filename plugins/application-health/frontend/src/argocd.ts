import type { CardData } from "./Overview";
export function argoCard(app: any, href?: string): CardData {
  const status = app?.status;
  if (!status || !app?.metadata?.name) throw Error("Invalid Argo CD application response");
  const sync = status.sync?.status || "Unknown", health = status.health?.status || "Unknown";
  const revision = status.sync?.revision;
  return {status: `${sync} · ${health}`, detail: "", href,
    observedAt: status.reconciledAt,
    bullets: [`Application: ${app.metadata.name}`, `Sync: ${sync}`, `Health: ${health}`,
      ...(revision ? [`Revision: ${revision.slice(0, 12)}`] : []),
      ...(Array.isArray(status.resources) ? [`Managed resources: ${status.resources.length}`] : [])]};
}
