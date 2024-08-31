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

/**
 * Matches a carriage return, line feed, carriage return line feed, virtual space, end of file, or space character
 * @returns
 */
function isLineEndingTabOrSpace(code: Code) {
  return code && (code < codes.nul || code === codes.space);
}

/**
 * Matches a carriageReturnLineFeed, carriageReturn, or lineFeed
 */
function isLineEnding(code: Code) {
  return code && code < codes.horizontalTab;
}

/**
 * Matches the end of a file
 */
function isEndOfFile(code: number): boolean {
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

export interface WikiLinkSyntaxOptions {
  aliasDivider?: string;
}

export function syntax(opts: WikiLinkSyntaxOptions = {}): Extension {
  const embedStartMarker = codes.exclamationMark;
  const startMarker = '[[';
  const aliasDivider = opts.aliasDivider ?? ':';
  const endMarker = ']]';

  // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
  const employMarkdownTableFix = opts.aliasDivider === '|';

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    let data = false;
    let alias = false;

    let aliasCursor = 0;
    let startMarkerCursor = 0;
    let endMarkerCursor = 0;

    return start;

    function start(code: Code): State | undefined {
      // when the code matches the start marker
      const nextStartMarkerCode = startMarker.charCodeAt(startMarkerCursor);
      if (code === nextStartMarkerCode) {
        effects.enter('wikiLink');
        effects.enter('wikiLinkMarker');
        return consumeStart(code);
      }

      // when the code matches the start embed marker
      if (code === embedStartMarker) {
        effects.enter('wikiLink', { embed: true });
        effects.enter('wikiLinkMarker', { embed: true });
        return consumeStart(code);
      }

      return nok(code);
    }

    function consumeStart(code: Code): State | undefined {
      // when the code is the first character after the end of the starting marker
      if (startMarkerCursor === startMarker.length) {
        effects.exit('wikiLinkMarker');
        return consumeData(code);
      }

      // when the code matches the starting marker
      const nextStartMarkerCode = startMarker.charCodeAt(startMarkerCursor);
      if (code === nextStartMarkerCode) {
        startMarkerCursor++;
        effects.consume(code);
        return consumeStart;
      }

      // when the code matches the start of an embed
      if (code === embedStartMarker) {
        effects.consume(code);
        return consumeStart;
      }

      return nok(code);
    }

    function consumeData(code: Code): State | undefined {
      if (!code || isLineEnding(code) || isEndOfFile(code)) {
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
        // when there is no title component inside the wikilink data, this is invalid syntax
        if (!data) return nok(code);
        effects.exit('wikiLinkTarget');
        effects.enter('wikiLinkAliasMarker');
        return consumeAliasMarker(code);
      }

      // when the code matches the end marker
      const nextEndMarkerCode = endMarker.charCodeAt(endMarkerCursor);
      if (code === nextEndMarkerCode) {
        // when there is no title component inside the wikilink data, this is invalid syntax
        if (!data) return nok(code);
        effects.exit('wikiLinkTarget');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (!code || isLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      // when the code matches non-whitespace, we know data exists inside the wikilink
      if (!isLineEndingTabOrSpace(code)) {
        data = true;
      }

      effects.consume(code);

      return consumeTarget;
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
      const nextEndMarkerCode = endMarker.charCodeAt(endMarkerCursor);
      if (code === nextEndMarkerCode) {
        // when we reach the end marker without seeing an alias, abort
        if (!alias) return nok(code);
        effects.exit('wikiLinkAlias');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (!code || isLineEnding(code) || isEndOfFile(code)) {
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
      // the syntax is valid and complete after the entire length of the end marker is matched
      if (endMarkerCursor === endMarker.length) {
        effects.exit('wikiLinkMarker');
        effects.exit('wikiLink');
        return ok(code);
      }

      // when the code matches th next character in the end marker
      const nextEndMarkerCode = endMarker.charCodeAt(endMarkerCursor);
      if (code !== nextEndMarkerCode) {
        return nok(code);
      }

      effects.consume(code);
      endMarkerCursor++;

      return consumeEnd;
    }
  }

  const wikiLinkConstruct: Construct = {
    tokenize: tokenize,
  };

  return {
    text: {
      [codes.leftSquareBracket]: wikiLinkConstruct,
      [codes.exclamationMark]: wikiLinkConstruct,
    } as ConstructRecord,
  };
}
