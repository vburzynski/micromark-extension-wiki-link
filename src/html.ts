import { CompileContext, HtmlExtension, Token } from "micromark-util-types";
import { WikiLinkHtmlConfig, WikiLinkHtmlOptions } from "./types.js";

interface WikiLinkAnchor {
  value: string;
  type: string;
}
interface WikiLink {
  target: string;
  anchors?: WikiLinkAnchor[];
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

const defaultConfig: WikiLinkHtmlConfig = {
  permalinks: [],
  brokenLinkClassName: 'broken-link',
  wikiLinkClassName: 'internal',

  // TODO: rename to destinationResolver or referenceResolver?
  pageResolver: (name: string) => [name.replace(/ /g, '_').toLowerCase()],

  // TODO: implement me to get the actual HTML identifier assigned to a heading anchor or block reference anchor
  anchorResolver: (name: string) => [name.replace(/ /g, '_').toLowerCase()],

  // TODO: rename to urlResolver or pathResolver?
  hrefTemplate: (permalink: string, anchor: string | undefined) => {
    if (permalink && anchor) return `page/${permalink}#${anchor}`;
    if (permalink) return `page/${permalink}`;
    if (anchor) return `#${anchor}`;
    return '#';
  }
};

function internalLinkHtml(opts: WikiLinkHtmlOptions = {}): HtmlExtension {
  const config: WikiLinkHtmlConfig = { ...defaultConfig, ...opts };

  function enterWikiLink(this: CompileContext, _token: Token): undefined {
    let stack: WikiLink [] = this.getData('wikiLinkStack') || [];
    this.setData('wikiLinkStack', stack);
    stack.push({ target: '' });
  }

  function exitWikiLinkHeading(this: CompileContext, token: Token): undefined {
    const anchor = this.sliceSerialize(token);
    const stack = this.getData('wikiLinkStack')
    const current = stack[stack.length - 1];

    current.anchors ||= [];
    current.anchors.push({ value: anchor, type: 'heading' });
  }

  function exitWikiLinkBlockId(this: CompileContext, token: Token): undefined {
    const blockId = this.sliceSerialize(token);
    const stack = this.getData('wikiLinkStack')
    const current = stack[stack.length - 1];

    current.anchors ||= [];
    current.anchors.push({ value: blockId, type: 'blockId' });
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
    const anchors = wikiLink.anchors;
    const href = config.hrefTemplate(permalink, anchors?.map((anchor) => anchor.value).join('-'));

    let classNames = [config.wikiLinkClassName];
    if (brokenLink) classNames.push(config.brokenLinkClassName);

    this.tag(`<a href="${href}" class="${classNames.join(' ')}">`)
    this.raw(displayName);
    this.tag('</a>');
  }

  function getPermalink(wikiLink: WikiLink): [string, boolean] {
    // by default, when no target is specified,
    let permalink: string = '';
    let brokenLink: boolean = false;
    let isTargetPresent: boolean = !!wikiLink.target && wikiLink.target.length > 0;

    // when the wikilink specifies a target...
    if (isTargetPresent) {
      // map/resolve the internal link target to an array of possible permalink candidates
      const permalinkCandidates = config.pageResolver(wikiLink.target!);
      // find the first permalink candidate that matches any of the configured permalinks
      const found = permalinkCandidates.find((pagePermalink) => config.permalinks.includes(pagePermalink));
      // when a match is found, use that as the permalink
      if (found) permalink = found;
      // designate the link as broken when no permalink is found
      brokenLink = !permalink;
      // when the link is broken use the first candidate
      if (brokenLink) permalink = permalinkCandidates[0];
    }

    return [permalink, brokenLink];
  }

  // TODO: make this configurable
  function getDisplayName(wikiLink: WikiLink): string {
    if (wikiLink.alias) return wikiLink.alias;

    let arr: string[] = [];

    if (wikiLink.target) arr.push(wikiLink.target);
    if (wikiLink.anchors) arr.push(...wikiLink.anchors.map(getAnchorDisplaySegment));
    if (arr.length) return arr.join(' > ');

    return wikiLink.target!;
  }

  function getAnchorDisplaySegment(anchor: WikiLinkAnchor): string {
    if (anchor.value && anchor.type === 'blockId') return `^${anchor.value}`;

    return anchor.value;
  }

  return {
    enter: {
      wikiLink: enterWikiLink,
    },
    exit: {
      wikiLinkDestination: exitWikiLinkTarget,
      wikiLinkHeading: exitWikiLinkHeading,
      wikiLinkBlockId: exitWikiLinkBlockId,
      wikiLinkAlias: exitWikiLinkAlias,
      wikiLink: exitWikiLink,
    },
  };
}

export { internalLinkHtml };
