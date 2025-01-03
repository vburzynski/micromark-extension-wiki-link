
export interface WikiLinkSyntaxOptions {
  aliasDivider?: string;
  openingFence?: string;
  closingFence?: string;
}

export interface WikiLinkSyntaxConfig {
  aliasDivider: string;
  openingFence: string;
  closingFence: string;
}

export type PageDestinationResolver = (destination: string) => string[];

export type PageAnchorResolver = (destination: string, heading: string) => string[];

export type HrefTemplate = (permalink: string, anchor: string | undefined) => string;

export type WikiLinkHtmlOptions = Partial<WikiLinkHtmlConfig>

export interface WikiLinkHtmlConfig {
  // a class name to give to every rendered internal link (wiki link)
  wikiLinkClassName: string;

  // a class name to give to every broken internal link (the target did not point to anything)
  brokenLinkClassName: string;

  // a set of all permalinks that map to all the known and existing pages
  permalinks: string[];

  // a callback that resolves a target name to a list of candidate permalinks
  pageResolver: PageDestinationResolver;

  // a callback that reolves a heading to an anchor
  anchorResolver: PageAnchorResolver;

  // a callback that renders the href URI/URL for a given link
  hrefTemplate: HrefTemplate;
}

