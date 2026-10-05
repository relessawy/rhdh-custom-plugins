export interface Config {
  applicationHealth?: {
    /** @visibility frontend */
    enabledCards?: string[];
    /** @visibility frontend */
    detailTabs?: string[];
  };
}
