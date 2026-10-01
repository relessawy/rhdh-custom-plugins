import React, { useCallback } from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef, Entity } from "@backstage/catalog-model";
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from "@backstage/core-plugin-api";
import { SecurityPanel, Summary } from "./SecurityPanel";
export const isSnykSecurityAvailable = (entity: Entity) =>
  Boolean(
    entity.metadata.annotations?.["snyk-security.io/binding"] ||
      entity.metadata.annotations?.["jenkins.io/job-full-name"]
  );
export function SnykSecurity() {
  const { entity } = useEntity(),
    discovery = useApi(discoveryApiRef),
    fetcher = useApi(fetchApiRef);
  const load = useCallback(
    async (ref: string): Promise<Summary> => {
      const base = await discovery.getBaseUrl("snyk-security");
      const r = await fetcher.fetch(
        `${base}/summary?entity=${encodeURIComponent(ref)}`
      );
      if (!r.ok) throw Error("Security evidence unavailable");
      const value = await r.json();
      if (!Array.isArray(value.scans) || value.scans.length !== 3)
        throw Error("Invalid report");
      return value;
    },
    [discovery, fetcher]
  );
  return <SecurityPanel entityRef={stringifyEntityRef(entity)} load={load} />;
}
