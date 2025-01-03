import { CompileContext, HtmlExtension, Token } from "micromark-util-types";
import { HtmlConfig, HtmlOptions } from "./types.js";

interface WikiLink {
  target: string;
  anchor?: string;
  alias?: string;
}

declare module 'micromark-util-types' {
  interface CompileData {
    wikiLinkStack: WikiLink[];
  }

  interface Token {
    embed: boolean;
  }
}

const defaultConfig: HtmlConfig = {
  permalinks: [],
  brokenLinkClassName: 'broken-link',
  wikiLinkClassName: 'internal',
  // the page resolver passes back a list of candidate page paths (relative)
  pageResolver: (name: string) => [name.replace(/ /g, '_').toLowerCase()],
  hrefTemplate: (permalink: string, anchor: string) => {
    if (permalink && anchor) return `page/${permalink}#${anchor}`;
    if (permalink) return `page/${permalink}`;
    if (anchor) return anchor;
    return '#';
  },
};

function internalLinkHtml(opts: HtmlOptions = {}): HtmlExtension {
  const config: HtmlConfig = { ...defaultConfig, ...opts };

  function enterWikiLink(this: CompileContext, _token: Token): undefined {
    let stack: WikiLink [] = this.getData('wikiLinkStack') || [];
    this.setData('wikiLinkStack', stack);
    stack.push({ target: '' });
  }


  function exitWikiLinkAlias(this: CompileContext, token: Token): undefined {
    const alias = this.sliceSerialize(token);
    const stack = this.getData('wikiLinkStack')
    const current = stack[stack.length - 1];
    current.alias = alias;
  }

  function exitWikiLinkTarget(this: CompileContext, token: Token): undefined {
    const target = this.sliceSerialize(token);
    const stack = this.getData('wikiLinkStack');
    const current = stack[stack.length - 1];
    current.target = target;
  }

  function exitWikiLink(this: CompileContext): undefined {
    const stack = this.getData('wikiLinkStack');
    const wikiLink = stack.pop() as WikiLink;

    const [permalink, brokenLink] = getPermalink(wikiLink);
    const displayName: string = getDisplayName(wikiLink);
    const anchor = wikiLink.anchor;
    const href = config.hrefTemplate(permalink, anchor);

    let classNames = [config.wikiLinkClassName];
    if (brokenLink) classNames.push(config.brokenLinkClassName);

    this.tag(`<a href="${href}" class="${classNames.join(' ')}">`)
    this.raw(displayName);
    this.tag('</a>');
  }

  function getPermalink(wikiLink: WikiLink): [string, boolean] {
    let permalink: string = '';
    let brokenLink: boolean = false;

    // when there's a target, find a permalink to map to
    // otherwise we're linking to an anchor or block-id on the current page
    if (wikiLink.target) {
      const permalinkCandidates = config.pageResolver(wikiLink.target!);
      const found = permalinkCandidates.find((pagePermalink) => config.permalinks.includes(pagePermalink));
      if (found) permalink = found;
      brokenLink = !permalink;
      if (brokenLink) permalink = permalinkCandidates[0];
    }

    return [permalink, brokenLink];
  }

  function getDisplayName(wikiLink: WikiLink): string {
    if (wikiLink.alias) return wikiLink.alias;
    if (wikiLink.anchor) return wikiLink.anchor;

    return wikiLink.target!;
  }

  return {
    enter: {
      wikiLink: enterWikiLink,
    },
    exit: {
      wikiLinkTarget: exitWikiLinkTarget,
      wikiLinkAlias: exitWikiLinkAlias,
      wikiLink: exitWikiLink,
    },
  };
}

export { internalLinkHtml };
