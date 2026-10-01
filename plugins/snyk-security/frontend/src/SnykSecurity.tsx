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
  Boolean(entity.metadata.annotations?.["snyk-security.io/binding"]);
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
      if (!r.ok) throw Error("Snyk unavailable");
      const value = await r.json();
      if (
        !Array.isArray(value.projects) ||
        !value.projects.length ||
        value.projects.length > 5 ||
        !value.projects.every(
          (p: any) =>
            Array.isArray(p.issues) && p.issues.length <= 100 && p.counts
        )
      )
        throw Error("Invalid summary");
      return value;
    },
    [discovery, fetcher]
  );
  return <SecurityPanel entityRef={stringifyEntityRef(entity)} load={load} />;
}
