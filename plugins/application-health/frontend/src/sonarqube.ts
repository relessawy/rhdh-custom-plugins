import type { CardData } from "./Overview";
export function sonarCard(findings: any, href?: string): CardData {
  if (!findings || !Array.isArray(findings.measures)) throw Error("No SonarQube analysis available");
  const metrics = Object.fromEntries(findings.measures.map((m: any) => [m.metric, m.value]));
  const gate = metrics.alert_status;
  const labels: Record<string,string> = {coverage:"Coverage",duplicated_lines_density:"Duplicated lines",bugs:"Reliability issues",vulnerabilities:"Security issues",code_smells:"Maintainability issues"};
  return {status: gate === "OK" ? "Quality gate · PASSED" : gate === "ERROR" ? "Quality gate · FAILED" : "Quality gate · Unknown",
    detail:"", href, observedAt:findings.analysisDate,
    bullets:Object.entries(labels).filter(([key])=>metrics[key] !== undefined).map(([key,label])=>`${label}: ${metrics[key]}${["coverage","duplicated_lines_density"].includes(key)?"%":""}`)};
}
