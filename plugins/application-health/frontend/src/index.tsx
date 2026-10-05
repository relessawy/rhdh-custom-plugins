import React, { useCallback, useEffect, useState } from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef } from "@backstage/catalog-model";
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  configApiRef,
} from "@backstage/core-plugin-api";
import {
  Overview,
  CardId,
  CardData,
  parseHidden,
  preferenceKey,
  configuredCards,
} from "./Overview";
export const isApplicationHealthAvailable = (e: any) =>
  e.kind?.toLowerCase() === "component";
export function ApplicationHealthOverview() {
  const { entity } = useEntity(),
    ref = stringifyEntityRef(entity),
    discovery = useApi(discoveryApiRef),
    fetcher = useApi(fetchApiRef),
    identity = useApi(identityApiRef),
    config = useApi(configApiRef);
  const [user, setUser] = useState<string>();
  useEffect(() => {
    let active = true;
    identity
      .getBackstageIdentity()
      .then((i) => {
        if (active) setUser(i.userEntityRef);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [identity]);
  const ids = configuredCards(entity.metadata.annotations || {},
    config.getOptionalStringArray("applicationHealth.enabledCards") || []);
  const base = `/catalog/${encodeURIComponent(
    entity.metadata.namespace || "default"
  )}/component/${encodeURIComponent(entity.metadata.name)}`;
  const load = useCallback(
    async (id: CardId, window = "7d"): Promise<CardData> => {
      const plugins = {
          vault: "vault-health",
          jenkins: "ci-progress",
          snyk: "snyk-security",
          splunk: "splunk-logs",
        },
        paths = {
          vault: "vault",
          jenkins: "progress",
          snyk: "summary",
          splunk: "summary",
        };
      const response = await fetcher.fetch(
        `${await discovery.getBaseUrl(plugins[id])}/${
          paths[id]
        }?entity=${encodeURIComponent(ref)}${
          id === "splunk" ? "&window=" + encodeURIComponent(window) : ""
        }`
      );
      if (!response.ok) throw Error("Unavailable");
      const d = await response.json();
      if (id === "vault") {
        const labels: Record<string, string> = {
          connection: "Vault connection",
          authentication: "Workload authentication",
          delivery: "Secret delivery",
          consumption: "Application consumption",
          rotation: "Rotation verification",
        };
        const states = Object.values(d.checks).map((x: any) => x.status);
        return {
          status: d.stale
            ? "Stale evidence"
            : states.some((x) => x === "unavailable")
            ? "Unavailable"
            : states.some((x) => x === "degraded")
            ? "Needs attention"
            : states.every((x) => x === "healthy")
            ? "Verified"
            : "",
          detail: "",
          bullets: Object.entries(d.checks).map(([k, v]: any) => `${labels[k]}: ${v.status}`),
          observedAt: d.observedAt,
          href: (config.getOptionalStringArray("applicationHealth.detailTabs") || []).includes("vault") ? base + "/vault" : undefined,
        };
      }
      if (id === "jenkins")
        return {
          status: `Build #${d.number} · ${d.status}`,
          detail: `${
            d.stages?.length || 0
          } reported stages.`,
          href: (config.getOptionalStringArray("applicationHealth.detailTabs") || []).includes("jenkins") ? base + "/ci" : undefined,
        };
      if (id === "snyk")
        return {
          status: `Build #${d.buildNumber} · Scan policy: ${d.gate}`,
          detail: "",
          bullets: (d.scans || []).map((scan:any)=>`${({code:"Source code",dependencies:"Dependencies",container:"Container image"} as Record<string,string>)[scan.kind] || scan.kind}: ${scan.status.replaceAll("_"," ")}`),
          observedAt: d.observedAt,
          href: (config.getOptionalStringArray("applicationHealth.detailTabs") || []).includes("snyk") ? base + "/security" : undefined,
        };
      return {
        status:
          d.requests === 0 ? "No recent requests" : `${d.requests} requests`,
        detail: `${({"5m":"Last 5 minutes","15m":"Last 15 minutes","1h":"Last hour","6h":"Last 6 hours","24h":"Last 24 hours","7d":"Last week"} as Record<string,string>)[window]} · ${d.errors} server errors. No traffic is not a health check.`,
        observedAt: d.updatedAt,
        href: (config.getOptionalStringArray("applicationHealth.detailTabs") || []).includes("splunk") ? base + "/splunk" : undefined,
      };
    },
    [ref, base, discovery, fetcher, config]
  );
  if (!user) return <p>Loading your application overview…</p>;
  const key = preferenceKey(user, ref);
  return (
    <Overview
      key={key}
      ids={ids}
      load={load}
      read={() => {
        try {
          return parseHidden(localStorage.getItem(key));
        } catch {
          return [];
        }
      }}
      save={(v) => {
        try {
          localStorage.setItem(key, JSON.stringify(v));
          return true;
        } catch {
          return false;
        }
      }}
    />
  );
}
