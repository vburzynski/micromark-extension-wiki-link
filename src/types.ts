
export interface WikiLinkSyntaxOptions {
  aliasDivider?: string;
}

export interface HtmlOptions {
  permalinks?: string[];
  pageResolver?: (name: string) => string[];
  newClassName?: string;
  wikiLinkClassName?: string;
  hrefTemplate?: (permalink: string) => string;
}

