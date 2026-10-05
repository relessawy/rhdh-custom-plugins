export interface Config {
  applicationHealth?: {
    /** @visibility frontend */
    argoBackendId?: string;
    /** @visibility frontend */
    enabledCards?: string[];
    /** @visibility frontend */
    detailTabs?: string[];
  };
}
