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
import { WikiLinkConfig, WikiLinkSyntaxOptions } from './types.js';
import { markdownLineEnding } from 'micromark-util-character';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLink: 'wikiLink', // encloses the entire wikilink
    wikiLinkMarker: 'wikiLinkMarker' // encloses the opening or closing markers
    wikiLinkData: 'wikiLinkData' // encloses the target and optional divider/alias combo
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

const defaultConfig: WikiLinkConfig = {
  aliasDivider: ':',
  openingFence: '[[',
  closingFence: ']]',
}

export function internalLinkSyntax(options: WikiLinkSyntaxOptions = {}): Extension {
  const embedModifier = codes.exclamationMark;
  const config: WikiLinkConfig = { ...defaultConfig, ...options }

  // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
  const employMarkdownTableFix = config.aliasDivider === '|';

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    const self = this;

    let containsTarget = false;
    let containsAlias = false;

    let openingMarkerSize = 0;
    let closingMarkerSize = 0;
    let aliasSize = 0;

    return start;

    /**
     * Determine if we're starting an internal link (wiki link) or embed
     */
    function start(code: Code): State | undefined {

      // when the first code matches the first code of the opening fence
      const firstCodeForLinkOpenMarker = config.openingFence.charCodeAt(0);
      if (code === firstCodeForLinkOpenMarker) {
        return startWikiLink(code);
      }

      // when the first code matches the start embed modifier
      if (code === embedModifier) {
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
      if (code === embedModifier) {
        effects.enter('wikiLink', { embed: true });
        effects.enter('wikiLinkMarker', { embed: true });
        effects.consume(code);

        return openingMarker;
      }
      return nok(code);
    }

    function openingMarker(code: Code): State | undefined {
      // when we've reached the first code after the end of the opening fence
      if (openingMarkerSize === config.openingFence.length) {
        return afterOpenMarker(code);
      }

      // when the current code matches the next code position in the opening fence
      const nextStartMarkerCode = config.openingFence.charCodeAt(openingMarkerSize);
      if (code === nextStartMarkerCode) {
        effects.consume(code);
        openingMarkerSize++;
        return openingMarker;
      }

      return nok(code);
    }

    /**
     * End the opening fence and start the data
     */
    function afterOpenMarker(code: Code): State | undefined {
      effects.exit('wikiLinkMarker');
      effects.enter('wikiLinkData');

      return beforeTarget(code);
    }

    /**
     * At the start of a target value
     */
    function beforeTarget(code: Code): State | undefined {

      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      effects.enter('wikiLinkTarget');

      return target(code);
    }

    function target(code: Code): State | undefined {
      // when using the backslash as an alias divider, we have to also check for the escaped version
      if (employMarkdownTableFix && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, aliasDivider, target)(code);
      }

      // when code matches the first code of the alias divider
      const firstAliasMarkerCode = config.aliasDivider.charCodeAt(0);
      if (code === firstAliasMarkerCode) {
        effects.exit('wikiLinkTarget');
        return beforeAliasMarker(code);
      }

      // when the current code matches the first code of the closing fence
      const firstClosingFenceCode = config.closingFence.charCodeAt(closingMarkerSize);
      if (code === firstClosingFenceCode) {
        effects.exit('wikiLinkTarget');
        return beforeClosingFence(code);
      }

      // when we reach the end of a line (or end of file) without closing the link, this is not valid syntax
      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      // when the code matches non-whitespace, we know data exists inside the wikilink
      if (!isLineEndingTabOrSpace(code)) {
        containsTarget = true;
      }

      effects.consume(code);

      return target;
    }

    function beforeAliasMarker(code: Code): State | undefined {
      if (containsTarget) {
        effects.enter('wikiLinkAliasMarker');
        return aliasDivider(code);
      }

      return nok(code);
    }

    function aliasDivider(code: Code): State | undefined {

      // when the cursor is past the length of the alias divider, move on to consuming the alias value
      if (aliasSize === config.aliasDivider.length) {
        effects.exit('wikiLinkAliasMarker');
        return beforeAlias(code);
      }

      // WHEN the code does not match the next code in the alias divider, THEN the syntax does not match the grammar
      const nextAliasMarkerCode = config.aliasDivider.charCodeAt(aliasSize);
      if (code !== nextAliasMarkerCode) {
        return nok(code);
      }

      effects.consume(code);
      aliasSize++;

      return aliasDivider;
    }

    function beforeAlias(code: Code): State | undefined {
      effects.enter('wikiLinkAlias');
      return alias(code);
    }

    function alias(code: Code): State | undefined {
      // when the code matches the first code of the closing fence, proceed to the next segment
      const nextEndMarkerCode = config.closingFence.charCodeAt(closingMarkerSize);
      if (code === nextEndMarkerCode) {
        return afterAlias(code);
      }

      // if we reach a line ending or EOF before closing the internal link, this is invalid syntax
      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      // as long as the alias has more than just whitespace, there's alias content
      if (!isLineEndingTabOrSpace(code)) {
        containsAlias = true;
      }

      // otherwise keep consuming the alias
      effects.consume(code);
      return alias;
    }

    function afterAlias(code: Code): State | undefined {
      // ensure we detected an alias after the divider
      if (containsAlias) {
        effects.exit('wikiLinkAlias');
        return beforeClosingFence(code)
      }

      return nok(code);
    }

    /**
     * Exit the data sequence and start the closing fence
     */
    function beforeClosingFence(code: Code): State | undefined {
      // ensure we have at least a target at this point, otherwise the grammar is invalid
      if (containsTarget) {
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return closingFence(code);
      }

      return nok(code);
    }

    function closingFence(code: Code): State | undefined {
      // when we've reached the end of the closing fence
      if (closingMarkerSize === config.closingFence.length) {
        return afterClosingFence(code);
      }

      // when the code matches the next code in the closing fence
      const nextEndMarkerCode = config.closingFence.charCodeAt(closingMarkerSize);
      if (code !== nextEndMarkerCode) {
        return nok(code);
      }

      effects.consume(code);
      closingMarkerSize++;

      return closingFence;
    }

    function afterClosingFence(code: Code): State | undefined {
      // the syntax is valid and complete
      effects.exit('wikiLinkMarker');
      effects.exit('wikiLink');
      return ok(code);
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
