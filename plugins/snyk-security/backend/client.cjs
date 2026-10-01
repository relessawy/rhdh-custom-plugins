"use strict";
const fs = require("node:fs/promises");
const kinds = ["code", "dependencies", "container"];
const statuses = ["PASSED", "BLOCKED", "ERROR", "NOT_RUN"];
const severities = ["critical", "high", "medium", "low", "info"];
const sha = /^[0-9a-f]{40}$/;
function endpoint(value) {
  const u = new URL(value);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw Error("Invalid Jenkins endpoint");
  return value.replace(/\/$/, "");
}
function safePath(value) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    value
      .split("/")
      .some((s) => !s || s === "." || s === ".." || /[?#\\%\x00-\x1f]/.test(s))
  )
    throw Error("Invalid path");
  return value.split("/").map(encodeURIComponent).join("/");
}
async function json(url, authorization, signal, fetcher = fetch) {
  const r = await fetcher(url, {
    headers: { Authorization: authorization },
    redirect: "error",
    signal,
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw Error("Evidence unavailable");
  }
  const reader = r.body.getReader();
  let size = 0,
    chunks = [];
  try {
    while (true) {
      const x = await reader.read();
      if (x.done) break;
      size += x.value.length;
      if (size > 900000) throw Error("Oversized report");
      chunks.push(Buffer.from(x.value));
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function text(v, max = 600) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function validateReport(v, b) {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.entityRef !== b.entityRef ||
    !sha.test(v.commit) ||
    !/^[1-9][0-9]{0,8}$/.test(String(v.buildNumber)) ||
    !Number.isFinite(Date.parse(v.observedAt)) ||
    Date.parse(v.observedAt) > Date.now() + 300000 ||
    !Array.isArray(v.scans) ||
    v.scans.length !== 3 ||
    new Set(v.scans.map((s) => s.kind)).size !== 3
  )
    throw Error("Invalid report");
  const scans = v.scans.map((s) => {
    if (
      !kinds.includes(s.kind) ||
      !statuses.includes(s.status) ||
      !Array.isArray(s.findings)
    )
      throw Error("Invalid scan");
    if (
      s.status !== "NOT_RUN" &&
      (s.entityRef !== v.entityRef ||
        s.commit !== v.commit ||
        s.schemaVersion !== 1)
    )
      throw Error("Scan binding mismatch");
    if (
      ["PASSED", "BLOCKED"].includes(s.status) &&
      (![0, 1].includes(s.exitCode) || !severities.includes(s.threshold))
    )
      throw Error("Incomplete scan");
    if (
      s.kind === "container" &&
      s.status === "PASSED" &&
      !/^[0-9a-f]{64}$/.test(s.archiveSha256)
    )
      throw Error("Missing image digest");
    const counts = {};
    for (const level of severities) {
      const n = s.counts?.[level] || 0;
      if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid counts");
      counts[level] = n;
    }
    const findings = s.findings.slice(0, 200).map((f) => {
      if (!severities.includes(f.severity)) throw Error("Unknown severity");
      return {
        id: text(f.id, 180),
        severity: f.severity,
        title: text(f.title),
        file: text(f.file),
        line: Number.isSafeInteger(f.line) ? f.line : null,
        package: text(f.package),
        version: text(f.version, 100),
        fixedIn: Array.isArray(f.fixedIn)
          ? f.fixedIn.slice(0, 30).map((x) => text(x, 100))
          : [],
      };
    });
    const threshold = severities.indexOf(s.threshold);
    const blocked =
      threshold >= 0 &&
      severities.slice(0, threshold + 1).some((level) => counts[level] > 0);
    if (
      (s.status === "PASSED" && blocked) ||
      (s.status === "BLOCKED" && !blocked)
    )
      throw Error("Policy/count mismatch");
    for (const level of severities)
      if (findings.filter((f) => f.severity === level).length > counts[level])
        throw Error("Finding/count mismatch");
    return {
      kind: s.kind,
      status: s.status,
      threshold: text(s.threshold),
      counts,
      findings,
      truncated: !!s.truncated || s.findings.length > 200,
      archiveSha256:
        s.kind === "container" ? text(s.archiveSha256, 64) : undefined,
    };
  });
  return {
    schemaVersion: 1,
    entityRef: v.entityRef,
    commit: v.commit,
    buildNumber: String(v.buildNumber),
    observedAt: v.observedAt,
    stale: Date.now() - Date.parse(v.observedAt) > 86400000,
    scans,
    gate: scans.some((s) => s.status === "ERROR")
      ? "ERROR"
      : scans.some((s) => s.status === "BLOCKED")
      ? "BLOCKED"
      : scans.some((s) => s.status === "NOT_RUN")
      ? "INCOMPLETE"
      : "PASSED",
  };
}
async function loadSecurity(settings, b, fetcher = fetch) {
  if (b.file) {
    const f = await fs.open(b.file, "r");
    try {
      if ((await f.stat()).size > 900000) throw Error("Oversized report");
      const buf = Buffer.alloc(900001);
      const { bytesRead } = await f.read(buf, 0, buf.length, 0);
      if (bytesRead > 900000) throw Error("Oversized report");
      return validateReport(
        JSON.parse(buf.subarray(0, bytesRead).toString()),
        b
      );
    } finally {
      await f.close();
    }
  }
  const path = b.job
    .split("/")
    .map((s) => "job/" + encodeURIComponent(s))
    .join("/");
  const signal = AbortSignal.timeout(20000),
    url = `${settings.base}/${path}`;
  // Resolve once, then address the immutable build number for metadata and artifact.
  const meta = await json(
    `${url}/lastCompletedBuild/api/json?tree=number,result,building,actions[lastBuiltRevision[SHA1]]`,
    settings.authorization,
    signal,
    fetcher
  );
  if (
    !Number.isSafeInteger(meta.number) ||
    meta.number < 1 ||
    meta.building !== false
  )
    throw Error("Incomplete build");
  const report = validateReport(
    await json(
      `${url}/${meta.number}/artifact/${safePath(b.artifact)}`,
      settings.authorization,
      signal,
      fetcher
    ),
    b
  );
  const commits = (meta.actions || [])
    .map((a) => a.lastBuiltRevision?.SHA1)
    .filter((x) => sha.test(x));
  if (
    report.buildNumber !== String(meta.number) ||
    !commits.includes(report.commit)
  )
    throw Error("Build evidence mismatch");
  return {
    ...report,
    buildResult: text(meta.result, 30),
    jenkinsUrl: `${settings.publicBase}/${path}/${meta.number}/`,
  };
}
module.exports = { endpoint, safePath, json, validateReport, loadSecurity };
