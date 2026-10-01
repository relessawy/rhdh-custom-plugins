import React, { useCallback } from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import { stringifyEntityRef } from "@backstage/catalog-model";
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
  configApiRef,
} from "@backstage/core-plugin-api";
import { JiraPanel } from "./JiraPanel";
export const isJiraAvailable = () => true;
export function JiraIssues() {
  const { entity } = useEntity(),
    discovery = useApi(discoveryApiRef),
    fetcher = useApi(fetchApiRef),
    config = useApi(configApiRef);
  const ref = stringifyEntityRef(entity);
  const request = useCallback(
    async (path: string, init?: any) =>
      fetcher.fetch(
        `${await discovery.getBaseUrl("jira-work-items")}${path}`,
        init
      ),
    [discovery, fetcher]
  );
  return (
    <JiraPanel
      entityRef={ref}
      enabled={(
        config.getOptionalStringArray("jiraWorkItems.entities") || []
      ).includes(ref)}
      request={request}
    />
  );
}
