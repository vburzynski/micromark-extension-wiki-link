import type {
  Code,
  Construct,
  ConstructRecord,
  Effects,
  Extension,
  State,
  TokenizeContext,
  Tokenizer,
} from 'micromark-util-types';

import { codes } from 'micromark-util-symbol';
import { WikiLinkSyntaxOptions } from './types.js';
import { asciiAlpha, markdownLineEnding, markdownSpace } from 'micromark-util-character';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLink: 'wikiLink', // encloses the entire wikilink
    wikiLinkMarker: 'wikiLinkMarker' // encloses the opening or closing markers
    wikiLinkData: 'wikiLinkData'
    wikiLinkTarget: 'wikiLinkTarget' // encloses the first target value
    wikiLinkAliasMarker: 'wikiLinkAliasMarker' // the alias marker that might appear after the target
    wikiLinkAlias: 'wikiLinkAlias' // the alias value (appears after the alias marker)
  }
}

/**
 * Matches a carriage return, line feed, carriage return line feed, virtual space, end of file, or space character
 * @returns
 */
function isLineEndingTabOrSpace(code: Code) {
  return code && (code < codes.nul || code === codes.space);
}

function isEndOfFile(code: Code): boolean {
  return code === codes.eof;
}

/**
 * this tokenizer is necessary for when an aliased wikilink appears inside a GFM Table and the divider is a vertical bar
 */
const tokenizeEscapedPipeAliasMarker: Tokenizer = function (
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start;

  function start(code: Code) {
    if (code === codes.backslash) {
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkAliasMarker');
      effects.consume(code);
      return consumeAliasDivider;
    }
    return nok(code);
  }

  function consumeAliasDivider(code: Code) {
    return code === codes.verticalBar ? ok(code) : nok(code);
  }
};

/**
 * A construct to tokenize the escaped version of a vertical bar used as an alias divider
 */
const escapedVerticalBarAliasDivider: Construct = { tokenize: tokenizeEscapedPipeAliasMarker, partial: true };

export function syntax(opts: WikiLinkSyntaxOptions = {}): Extension {
  const embedMarker = codes.exclamationMark;
  const openMarker = '[[';
  const aliasDivider = opts.aliasDivider ?? ':';
  const closeMarker = ']]';

  // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
  const employMarkdownTableFix = opts.aliasDivider === '|';

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    const self = this;

    let containsTarget = false;
    let alias = false;
    let aliasCursor = 0;
    let openMarkerSize = 0;
    let endMarkerCursor = 0;

    return start;

    function start(code: Code): State | undefined {
      const firstCodeForLinkOpenMarker = openMarker.charCodeAt(0);

      // when the code matches the start marker
      if (code === firstCodeForLinkOpenMarker) {
        return startWikiLink(code);
      }
      // when the code matches the start embed marker
      if (code === embedMarker) {
        return startEmbed(code);
      }

      return nok(code);
    }

    function startWikiLink(code: Code) {
      effects.enter('wikiLink');
      effects.enter('wikiLinkMarker');

      return openingMarker(code);
    }

    function startEmbed(code: Code) {
      // when the code matches the start of an embed
      if (code === embedMarker) {
        effects.enter('wikiLink', { embed: true });
        effects.enter('wikiLinkMarker', { embed: true });
        effects.consume(code);

        return openingMarker;
      }
      return nok(code);
    }

    function openingMarker(code: Code): State | undefined {
      // when the code is the first character after the end of the starting marker
      if (openMarkerSize === openMarker.length) {
        return afterOpenMarker(code);
      }

      // when the code matches the starting marker
      const nextStartMarkerCode = openMarker.charCodeAt(openMarkerSize);
      if (code === nextStartMarkerCode) {
        effects.consume(code);
        openMarkerSize++;

        return openingMarker;
      }

      return nok(code);
    }

    function afterOpenMarker(code: Code): State | undefined {
      effects.exit('wikiLinkMarker');

      return consumeData(code);
    }

    function consumeData(code: Code): State | undefined {
      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      effects.enter('wikiLinkData');
      effects.enter('wikiLinkTarget');
      return consumeTarget(code);
    }

    function consumeTarget(code: Code): State | undefined {
      // when using the backslash as an alias divider, we have to also check for the escaped version
      if (employMarkdownTableFix && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, consumeAliasMarker, consumeTarget)(code);
      }

      // when the code matches the alias marker
      const nextAliasMarkerCode = aliasDivider.charCodeAt(aliasCursor);
      if (code === nextAliasMarkerCode) {
        return beforeAliasMarker(code);
      }

      // when the code matches the end marker
      const nextEndMarkerCode = closeMarker.charCodeAt(endMarkerCursor);
      if (code === nextEndMarkerCode) {
        return beforeCloseMarker(code);
      }

      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      // when the code matches non-whitespace, we know data exists inside the wikilink
      if (!isLineEndingTabOrSpace(code)) {
        containsTarget = true;
      }

      effects.consume(code);

      return consumeTarget;
    }

    function beforeAliasMarker(code: Code): State | undefined {
      if (containsTarget) {
        effects.exit('wikiLinkTarget');
        effects.enter('wikiLinkAliasMarker');
        return consumeAliasMarker(code);
      }

      return nok(code);
    }

    function beforeCloseMarker(code: Code): State | undefined {
      if (containsTarget) {
        effects.exit('wikiLinkTarget');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');

        return consumeEnd(code);
      }

      return nok(code);
    }

    function consumeAliasMarker(code: Code): State | undefined {
      // when the cursor is past the length of the alias divider, move on to consuming the alias
      if (aliasCursor === aliasDivider.length) {
        effects.exit('wikiLinkAliasMarker');
        effects.enter('wikiLinkAlias');
        return consumeAlias(code);
      }

      // if the code does not match the alias divider, the syntax does not match the grammar
      const nextAliasMarkerCode = aliasDivider.charCodeAt(aliasCursor);
      if (code !== nextAliasMarkerCode) {
        return nok(code);
      }

      effects.consume(code);
      aliasCursor++;

      return consumeAliasMarker;
    }

    function consumeAlias(code: Code): State | undefined {
      // when the code matches the end marker
      const nextEndMarkerCode = closeMarker.charCodeAt(endMarkerCursor);
      if (code === nextEndMarkerCode) {
        // when we reach the end marker without seeing an alias, abort
        if (!alias) return nok(code);
        effects.exit('wikiLinkAlias');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      // as long as the alias has more than just whitespace, there's alias content
      if (!isLineEndingTabOrSpace(code)) {
        alias = true;
      }

      effects.consume(code);

      return consumeAlias;
    }

    function consumeEnd(code: Code): State | undefined {
      debugger
      // the syntax is valid and complete after the entire length of the end marker is matched
      if (endMarkerCursor === closeMarker.length) {
        effects.exit('wikiLinkMarker');
        effects.exit('wikiLink');
        return ok(code);
      }

      // when the code matches th next character in the end marker
      const nextEndMarkerCode = closeMarker.charCodeAt(endMarkerCursor);
      if (code !== nextEndMarkerCode) {
        return nok(code);
      }

      effects.consume(code);
      endMarkerCursor++;

      return consumeEnd;
    }
  }

  const wikiLinkConstruct: Construct = {
    name: 'wikilink',
    tokenize: tokenize,
    concrete: true,
  };

  return {
    text: {
      // internal links start with a square bracket
      [codes.leftSquareBracket]: wikiLinkConstruct,
      // embed links start with an exclamation mark
      [codes.exclamationMark]: wikiLinkConstruct,
    } as ConstructRecord,
  };
}
