const STATES = new Set(["healthy", "degraded", "unavailable", "unknown"]);
const CHECKS = [
  "connection",
  "authentication",
  "delivery",
  "consumption",
  "rotation",
];
function sanitizeReport(input, entityRef, now = Date.now()) {
  if (!input || input.schemaVersion !== 1 || input.entityRef !== entityRef)
    throw Error("Invalid report");
  const time = Date.parse(input.observedAt);
  if (!Number.isFinite(time) || time > now + 30000)
    throw Error("Invalid observation time");
  const stale = now - time > 180000;
  const checks = {};
  for (const name of CHECKS) {
    const value = input.checks?.[name];
    checks[name] = {
      status: stale
        ? "stale"
        : STATES.has(value?.status)
        ? value.status
        : "unknown",
    };
    const stamp = Date.parse(value?.lastSuccessAt);
    if (Number.isFinite(stamp) && stamp <= now + 30000)
      checks[name].lastSuccessAt = new Date(stamp).toISOString();
  }
  // Never forward arbitrary producer text, paths, secret values or unknown fields.
  return { entityRef, observedAt: new Date(time).toISOString(), stale, checks };
}
module.exports = { sanitizeReport };
