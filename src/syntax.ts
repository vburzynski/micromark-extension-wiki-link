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
    wikiLinkAnchorDivider: 'wikiLinkAnchorDivider',
    wikiLinkAnchor: 'wikiLinkAnchor',
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

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >  ^
     * ```
     */
    function startWikiLink(code: Code) {
      // start the wiki link and first fence/marker
      effects.enter('wikiLink');
      effects.enter('wikiLinkMarker');

      return openingFence(code);
    }

    /**
     * ```markdown
     * > | ![[target#anchor|alias]]
     * >   ^
     * ```
     */
    function startEmbed(code: Code) {
      // when the code matches the start of an embed
      if (code === embedModifier) {
        effects.enter('wikiLink', { embed: true });
        effects.enter('wikiLinkMarker', { embed: true });
        effects.consume(code);

        return openingFence;
      }
      return nok(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >   ^^
     * ```
     */
    function openingFence(code: Code): State | undefined {
      // when we've reached the first code after the end of the opening fence
      if (openingMarkerSize === config.openingFence.length) {
        return afterOpeningFence(code);
      }

      // when the current code matches the next code position in the opening fence
      const nextStartMarkerCode = config.openingFence.charCodeAt(openingMarkerSize);
      if (code === nextStartMarkerCode) {
        effects.consume(code);
        openingMarkerSize++;
        return openingFence;
      }

      return nok(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^
     * ```
     */
    function afterOpeningFence(code: Code): State | undefined {
      effects.exit('wikiLinkMarker');
      effects.enter('wikiLinkData');

      if (code === codes.numberSign) {
        return beforeAnchor(code)
      }

      return beforeTarget(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^
     * ```
     */
    function beforeTarget(code: Code): State | undefined {
      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      effects.enter('wikiLinkTarget');

      return target(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^^^^^^
     * ```
     */
    function target(code: Code): State | undefined {
      if (code === codes.numberSign) {
        effects.exit('wikiLinkTarget');
        return beforeAnchor(code)
      }

      // when code matches the first code of the alias divider
      if (atAliasDivider(code)) {
        effects.exit('wikiLinkTarget');
        return beforeAliasDivider(code);
      }

      // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
      if (config.aliasDivider === '|' && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, betweenTargetAndAliasDivider, target)(code);
      }

      // when the current code matches the first code of the closing fence
      if (atClosingFence(code)) {
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

    function betweenTargetAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkTarget');
      return beforeAliasDivider(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >           ^
     * ```
     */
    function beforeAnchor(code: Code): State | undefined {
      if (code === codes.numberSign) {
        effects.enter('wikiLinkAnchorDivider');
        effects.consume(code);
        effects.exit('wikiLinkAnchorDivider');
        effects.enter('wikiLinkAnchor');
        return anchor;
      }

      return nok(code);
    }

    function anchor(code: Code): State | undefined {
      // exit when code matches the first code of the alias divider
      if (atAliasDivider(code)) {
        effects.exit('wikiLinkAnchor');
        return beforeAliasDivider(code);
      }

      // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
      if (config.aliasDivider === '|' && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, betweenAnchorAndAliasDivider, anchor)(code);
      }

      // when the current code matches the first code of the closing fence
      if (atClosingFence(code)) {
        effects.exit('wikiLinkAnchor');
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

      return anchor;
    }

    function betweenAnchorAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkAnchor');
      return beforeAliasDivider(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                 ^
     * ```
     */
    function beforeAliasDivider(code: Code): State | undefined {
      if (containsTarget) {
        effects.enter('wikiLinkAliasMarker');
        return aliasDivider(code);
      }

      return nok(code);
    }

    function atAliasDivider(code: Code): boolean {
      const firstAliasMarkerCode = config.aliasDivider.charCodeAt(0);
      return code === firstAliasMarkerCode;
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                  ^
     * ```
     */
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

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                   ^
     * ```
     */
    function beforeAlias(code: Code): State | undefined {
      effects.enter('wikiLinkAlias');
      return alias(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                   ^^^^^
     * ```
     */
    function alias(code: Code): State | undefined {
      // when the code matches the first code of the closing fence, proceed to the next segment
      if (atClosingFence(code)) return afterAlias(code);

      // if we reach a line ending or EOF before closing the internal link, this is invalid syntax
      if (markdownLineEnding(code) || isEndOfFile(code)) return nok(code);

      // as long as the alias has more than just whitespace, there's alias content
      containsAlias = !isLineEndingTabOrSpace(code);

      effects.consume(code);
      return alias;
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                       ^
     * ```
     */
    function afterAlias(code: Code): State | undefined {
      // ensure we detected an alias after the divider
      if (containsAlias) {
        effects.exit('wikiLinkAlias');
        return beforeClosingFence(code)
      }

      return nok(code);
    }

    function atClosingFence(code: Code): boolean {
      const firstClosingFenceCode = config.closingFence.charCodeAt(closingMarkerSize);
      return code === firstClosingFenceCode
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                       ^
     * ```
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

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                        ^^
     * ```
     */
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

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                          ^
     * ```
     */
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
