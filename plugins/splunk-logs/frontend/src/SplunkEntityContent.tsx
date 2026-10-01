import React, { useCallback } from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef } from "@backstage/catalog-model";
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from "@backstage/core-plugin-api";
import { SplunkPanel } from "./SplunkPanel";
export const isSplunkAvailable = (entity: any) =>
  Boolean(entity.metadata.annotations?.["splunk-logs.io/binding"]);
export function SplunkEntityContent() {
  const { entity } = useEntity(),
    discovery = useApi(discoveryApiRef),
    fetcher = useApi(fetchApiRef);
  const ref = stringifyEntityRef(entity);
  const load = useCallback(
    async (window: string) => {
      const base = await discovery.getBaseUrl("splunk-logs");
      const r = await fetcher.fetch(
        `${base}/summary?entity=${encodeURIComponent(ref)}&window=${window}`
      );
      if (!r.ok)
        throw Error("Splunk data unavailable. Check access and connection.");
      return r.json();
    },
    [ref, discovery, fetcher]
  );
  return <SplunkPanel entity={entity} load={load} />;
}
