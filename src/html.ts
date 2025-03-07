import { CompileContext, HtmlExtension, Token } from 'micromark-util-types';
import { WikiLinkHtmlConfig, WikiLinkHtmlOptions } from './types.js';

interface WikiLinkAnchor {
  value: string;
  type: string;
}
interface WikiLink {
  destination: string;
  anchors: WikiLinkAnchor[];
  alias?: string;
  embed?: boolean;
}

declare module 'micromark-util-types' {
  interface CompileData {
    wikiLink: WikiLink;
  }

  interface Token {
    embed: boolean;
  }
}

const defaultConfig: WikiLinkHtmlConfig = {
  permalinks: [],
  brokenLinkClassName: 'broken-link',
  wikiLinkClassName: 'internal',
  pageResolver: (destination) => [destination.replace(/ /g, '_').toLowerCase()],
  pageAnchorResolver: (_destination, anchors) => anchors.join('-').toLowerCase(),
  urlResolver: (permalink, anchor) => {
    if (permalink && anchor) return `page/${permalink}#${anchor}`;
    if (permalink) return `page/${permalink}`;
    if (anchor) return `#${anchor}`;
    return '#';
  },
};

function internalLinkHtml(opts: WikiLinkHtmlOptions = {}): HtmlExtension {
  const config: WikiLinkHtmlConfig = { ...defaultConfig, ...opts };

  function enterWikiLinkEmbed(this: CompileContext, _token: Token): undefined {
    let wikiLink: WikiLink = this.getData('wikiLink') || { destination: '', anchors: [] };
    wikiLink.embed = true;
    this.setData('wikiLink', wikiLink);
  }

  function enterWikiLink(this: CompileContext, _token: Token): undefined {
    let wikiLink: WikiLink = this.getData('wikiLink') || { destination: '', anchors: [] };
    this.setData('wikiLink', wikiLink);
  }

  function exitWikiLinkHeading(this: CompileContext, token: Token): undefined {
    const anchor = this.sliceSerialize(token);
    const wikiLink = this.getData('wikiLink');
    wikiLink.anchors ||= [];
    wikiLink.anchors.push({ value: anchor, type: 'heading' });
  }

  function exitWikiLinkBlockId(this: CompileContext, token: Token): undefined {
    const blockId = this.sliceSerialize(token);
    const wikiLink = this.getData('wikiLink');
    wikiLink.anchors ||= [];
    wikiLink.anchors.push({ value: blockId, type: 'blockId' });
  }

  function exitWikiLinkAlias(this: CompileContext, token: Token): undefined {
    const alias = this.sliceSerialize(token);
    const wikiLink = this.getData('wikiLink');
    wikiLink.alias = alias;
  }

  function exitWikiLinkDestination(this: CompileContext, token: Token): undefined {
    const destination = this.sliceSerialize(token);
    const wikiLink = this.getData('wikiLink');
    wikiLink.destination = destination;
  }

  function exitWikiLink(this: CompileContext): undefined {
    const wikiLink: WikiLink = this.getData('wikiLink');

    if (/\.(avif|bmp|gif|jpeg|jpg|png|svg|webp)$/.test(wikiLink.destination)) {
      renderImage.call(this, wikiLink);
    } else if (/\.(mkv|mov|mp4|ogv|webm)$/.test(wikiLink.destination)) {
      renderVideo.call(this, wikiLink);
    } else if (/\.(flac|m4a|mp3|ogg|wav|webm|3gp)$/.test(wikiLink.destination)) {
      renderAudio.call(this, wikiLink);
    } else if (/\.pdf$/.test(wikiLink.destination)) {
      renderPDF.call(this, wikiLink);
    } else if (wikiLink.embed) {
      renderEmbeddedContent.call(this, wikiLink);
    } else {
      renderInternalLink.call(this, wikiLink);
    }
  }

  // TODO: implement contentResolver to grab transcluded content
  function renderEmbeddedContent(this: CompileContext, wikiLink: WikiLink) {
    const blockAnchor = wikiLink.anchors.find((anchor) => anchor.type === 'blockId');
    const anchors = wikiLink.anchors.filter((anchor) => anchor.type === 'heading');

    const anchor: string = config.pageAnchorResolver(
      wikiLink.destination,
      anchors.map((anchor) => anchor.value)
    );
    const url: String = config.urlResolver(wikiLink.destination, anchor);

    if (blockAnchor) {
      this.tag(`<blockquote class="embed" data-url="${url}" data-block-id="${blockAnchor.value}">`);
    } else if (anchor) {
      this.tag(`<blockquote class="embed" data-url="${url}" data-anchor="${anchor}">`);
    } else {
      this.tag(`<blockquote class="embed" data-url="${url}">`);
    }
    this.tag(`<a href="${url}">`);
    this.raw(`Click to open: ${wikiLink.destination}`);
    this.tag('</a>');
    this.tag('</blockquote>');
  }

  function renderAudio(this: CompileContext, wikiLink: WikiLink) {
    const url: String = config.urlResolver(wikiLink.destination);
    this.tag(`<audio src="${url}" controls></audio>`);
  }

  const ALIAS_WIDTH_REGEX = /^\d+$/;
  const ALIAS_DIMENSION_REGEX = /^(\d+)x(\d+)$/;

  function renderImage(this: CompileContext, wikiLink: WikiLink) {
    const url: String = config.urlResolver(wikiLink.destination);

    if (ALIAS_WIDTH_REGEX.test(wikiLink.alias || '')) {
      this.tag(`<img src="${url}" width="${wikiLink.alias}" />`);
    } else if(ALIAS_DIMENSION_REGEX.test(wikiLink.alias || '')) {
      const matches = wikiLink.alias!.match(ALIAS_DIMENSION_REGEX);
      this.tag(`<img src="${url}" height="${matches![1]}" width="${matches![2]}" />`);
    } else {
      this.tag(`<img src="${url}" />`);
    }
  }

  const PAGE_ANCHOR_REGEX = /^page=(\d+)$/;
  const HEIGHT_ANCHOR_REGEX = /^height=(\d+)$/;

  function renderPDF(this: CompileContext, wikiLink: WikiLink) {
    const url: String = config.urlResolver(wikiLink.destination);

    const pageAnchor = wikiLink.anchors.find((anchor) => PAGE_ANCHOR_REGEX.test(anchor.value));
    const heightAnchor = wikiLink.anchors.find((anchor) => HEIGHT_ANCHOR_REGEX.test(anchor.value));

    if (heightAnchor) {
      const matches = heightAnchor.value.match(HEIGHT_ANCHOR_REGEX);
      this.tag(`<embed src="${url}" height="${matches![1]}" type="application/pdf"></embed>`);
    } else if (pageAnchor) {
      this.tag(`<embed src="${url}#${pageAnchor.value}" type="application/pdf"></embed>`);
    } else {
      this.tag(`<embed src="${url}" type="application/pdf"></embed>`);
    }

    // this.tag(`<embed src="${url}" width="720" height="480" type="application/pdf" />`);
  }

  function renderVideo(this: CompileContext, wikiLink: WikiLink) {
    const url: String = config.urlResolver(wikiLink.destination);
    this.tag(`<video src="${url}" controls></video>`);
  }

  function renderInternalLink(this: CompileContext, wikiLink: WikiLink) {
    const [permalink, brokenLink] = identifyPage(wikiLink);
    const displayName: string = getDisplayName(wikiLink);

    const anchor: string = config.pageAnchorResolver(
      wikiLink.destination,
      wikiLink.anchors.map((anchor) => anchor.value)
    );
    const href = config.urlResolver(permalink, anchor);

    let classNames = [config.wikiLinkClassName];
    if (brokenLink) {
      classNames.push(config.brokenLinkClassName);
    }

    this.tag(`<a href="${href}" class="${classNames.join(' ')}">`);
    this.raw(displayName);
    this.tag('</a>');
  }

  function isDestinationPresent(destination: String): Boolean {
    return !!destination && destination.length > 0;
  }

  function identifyPage(wikiLink: WikiLink): [string, boolean] {
    // by default, when no target is specified,
    let page: string = '';
    let brokenLink: boolean = false;

    if (isDestinationPresent(wikiLink.destination)) {
      // map/resolve the internal link target to an array of possible page candidates
      const pageCandidates = config.pageResolver(wikiLink.destination!);

      // find the first permalink candidate that matches any of the configured permalinks
      const found = pageCandidates.find((pagePermalink) => config.permalinks.includes(pagePermalink)) || '';

      brokenLink = !found;
      page = found || '';

      // when the link is broken default to the first permalink candidate
      if (brokenLink && pageCandidates.length) {
        page = pageCandidates[0];
      }
    }

    return [page, brokenLink];
  }

  function getDisplayName(wikiLink: WikiLink): string {
    if (wikiLink.alias) return wikiLink.alias;

    let arr: string[] = [];

    if (wikiLink.destination) arr.push(wikiLink.destination);
    if (wikiLink.anchors) arr.push(...wikiLink.anchors.map(getAnchorDisplaySegment));
    if (arr.length) return arr.join(' > ');

    return wikiLink.destination!;
  }

  function getAnchorDisplaySegment(anchor: WikiLinkAnchor): string {
    if (anchor.value && anchor.type === 'blockId') return `^${anchor.value}`;

    return anchor.value;
  }

  return {
    enter: {
      wikiLinkEmbed: enterWikiLinkEmbed,
      wikiLink: enterWikiLink,
    },
    exit: {
      wikiLinkDestination: exitWikiLinkDestination,
      wikiLinkHeading: exitWikiLinkHeading,
      wikiLinkBlockId: exitWikiLinkBlockId,
      wikiLinkAlias: exitWikiLinkAlias,
      wikiLink: exitWikiLink,
    },
  };
}

export { internalLinkHtml };
