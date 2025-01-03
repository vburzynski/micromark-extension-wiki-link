import { CompileContext, HtmlExtension, Token } from "micromark-util-types";
import { HtmlOptions } from "./types.js";

interface WikiLink {
  target: string;
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

function html(opts: HtmlOptions = {}): HtmlExtension {
  const permalinks = opts.permalinks ?? [];
  const defaultPageResolver = (name: string) => [name.replace(/ /g, '_').toLowerCase()];
  const pageResolver = opts.pageResolver ?? defaultPageResolver;
  const newClassName = opts.newClassName ?? 'new';
  const wikiLinkClassName = opts.wikiLinkClassName ?? 'internal';
  const defaultHrefTemplate = (permalink: string) => `#/page/${permalink}`;
  const hrefTemplate = opts.hrefTemplate ?? defaultHrefTemplate;

  function enterWikiLink(this: CompileContext, _token: Token): undefined {
    let stack = this.getData('wikiLinkStack');
    if (!stack) this.setData('wikiLinkStack', (stack = []));

    stack.push({
      target: '',
    });
  }

  function top(stack: WikiLink[]) {
    return stack[stack.length - 1];
  }

  function exitWikiLinkAlias(this: CompileContext, token: Token): undefined {
    const alias = this.sliceSerialize(token);
    const current = top(this.getData('wikiLinkStack'));
    current.alias = alias;
  }

  function exitWikiLinkTarget(this: CompileContext, token: Token): undefined {
    const target = this.sliceSerialize(token);
    const current = top(this.getData('wikiLinkStack'));
    current.target = target;
  }

  function exitWikiLink(this: CompileContext): undefined {
    const wikiLink = this.getData('wikiLinkStack').pop();

    const pagePermalinks = pageResolver(wikiLink!.target);
    let permalink = pagePermalinks.find((pagePermalink) => permalinks.includes(pagePermalink));

    const exists = permalink !== undefined;
    if (!exists) {
      permalink = pagePermalinks[0];
    }

    let displayName = wikiLink!.target;
    if (wikiLink!.alias) {
      displayName = wikiLink!.alias;
    }

    let classNames = wikiLinkClassName;
    if (!exists) {
      classNames += ' ' + newClassName;
    }

    this.tag('<a href="' + hrefTemplate(permalink ?? '') + '" class="' + classNames + '">');
    this.raw(displayName);
    this.tag('</a>');
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

export { html };
