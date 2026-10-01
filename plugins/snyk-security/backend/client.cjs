"use strict";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEVERITIES = ["critical", "high", "medium", "low", "info"];
class SnykError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function text(v, max = 2048) {
  if (typeof v !== "string" || !v.length || v.length > max)
    throw new SnykError("invalid_response");
  return v;
}
function endpoint(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("Use an HTTPS origin without credentials or path");
  return u.origin;
}
async function json(url, token, signal, fetcher = fetch) {
  const r = await fetcher(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.api+json",
    },
    redirect: "error",
    signal,
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new SnykError(
      [401, 403].includes(r.status)
        ? "access_denied"
        : r.status === 429
        ? "rate_limited"
        : r.status === 404
        ? "not_found"
        : "unavailable"
    );
  }
  const reader = r.body?.getReader();
  if (!reader) throw new SnykError("invalid_response");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw new SnykError("invalid_response");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SnykError("invalid_response");
  }
}
function parseProject(body, binding, webBase) {
  const p = body?.data,
    a = p?.attributes,
    r = p?.relationships;
  if (
    p?.id !== binding.projectId ||
    p.type !== "project" ||
    r?.organization?.data?.id !== binding.orgId ||
    !UUID.test(r?.target?.data?.id) ||
    !["active", "inactive"].includes(a?.status) ||
    (binding.targetId && binding.targetId !== r.target.data.id)
  )
    throw new SnykError("invalid_response");
  return {
    id: p.id,
    name: text(a.name),
    type: text(a.type, 100),
    status: a.status,
    targetId: r.target.data.id,
    reference:
      typeof a.target_reference === "string"
        ? a.target_reference.slice(0, 256)
        : null,
    url: `${webBase}/org/${encodeURIComponent(binding.orgSlug)}/project/${
      p.id
    }`,
  };
}
function parseIssues(body, binding) {
  if (!Array.isArray(body?.data) || body.data.length > 100)
    throw new SnykError("invalid_response");
  const seen = new Set();
  const issues = body.data.map((i) => {
    const a = i?.attributes,
      r = i?.relationships;
    if (
      !UUID.test(i?.id) ||
      seen.has(i.id) ||
      i.type !== "issue" ||
      r?.organization?.data?.id !== binding.orgId ||
      r?.scan_item?.data?.id !== binding.projectId ||
      r.scan_item.data.type !== "project" ||
      !SEVERITIES.includes(a?.effective_severity_level) ||
      !["open", "resolved"].includes(a?.status) ||
      typeof a.ignored !== "boolean"
    )
      throw new SnykError("invalid_response");
    seen.add(i.id);
    return {
      id: i.id,
      title: text(a.title),
      severity: a.effective_severity_level,
      status: a.status,
      ignored: a.ignored,
      type: text(a.type, 100),
    };
  });
  const next = body.links?.next;
  if (
    next !== undefined &&
    next !== null &&
    typeof next !== "string" &&
    !(typeof next === "object" && typeof next.href === "string")
  )
    throw new SnykError("invalid_response");
  return { issues, partial: !!next };
}
async function loadSecurity(settings, bindings, fetcher = fetch) {
  const signal = AbortSignal.timeout(20000);
  const projects = [];
  for (const b of bindings) {
    const projectUrl = new URL(
      `${settings.apiBase}/rest/orgs/${b.orgId}/projects/${b.projectId}`
    );
    projectUrl.searchParams.set("version", settings.apiVersion);
    const project = parseProject(
      await json(projectUrl, settings.token, signal, fetcher),
      b,
      settings.webBase
    );
    const issueUrl = new URL(`${settings.apiBase}/rest/orgs/${b.orgId}/issues`);
    issueUrl.search = new URLSearchParams({
      version: settings.apiVersion,
      "scan_item.id": b.projectId,
      "scan_item.type": "project",
      limit: "100",
      status: "open",
      ignored: "false",
    }).toString();
    const result = parseIssues(
      await json(issueUrl, settings.token, signal, fetcher),
      b
    );
    // Filter defensively even if an upstream filter is not applied.
    const issues = result.issues.filter(
      (i) => i.status === "open" && !i.ignored
    );
    projects.push({
      ...project,
      issues,
      partial: result.partial,
      counts: Object.fromEntries(
        SEVERITIES.map((s) => [
          s,
          issues.filter((i) => i.severity === s).length,
        ])
      ),
    });
  }
  return { projects, observedAt: new Date().toISOString() };
}
module.exports = {
  UUID,
  SEVERITIES,
  SnykError,
  endpoint,
  json,
  parseProject,
  parseIssues,
  loadSecurity,
};
