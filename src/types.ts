
export interface WikiLinkSyntaxOptions {
  aliasDivider?: string;
  openingFence?: string;
  closingFence?: string;
}

export interface WikiLinkConfig {
  aliasDivider: string;
  openingFence: string;
  closingFence: string;
}

export interface HtmlOptions {
  permalinks?: string[];
  pageResolver?: (name: string) => string[];
  brokenLinkClassName?: string;
  wikiLinkClassName?: string;
  hrefTemplate?: (permalink: string, anchor: string | undefined) => string;
}

export interface HtmlConfig {
  permalinks: string[];
  pageResolver: (name: string) => string[];
  brokenLinkClassName: string;
  wikiLinkClassName: string;
  hrefTemplate: (permalink: string, anchor: string | undefined) => string;
}

