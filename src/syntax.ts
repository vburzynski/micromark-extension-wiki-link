import type { Code, Effects, Extension, State, TokenizeContext } from 'micromark-util-types';
import { codes } from 'micromark-util-symbol';

function isLineEndingOrSpace(code: number) {
  return code < codes.nul || code === codes.space;
}
function isLineEnding(code: number) {
  return code < codes.horizontalTab;
}

export interface SyntaxOptions {
  aliasDivider?: string;
}

export function syntax(opts: SyntaxOptions = {}): Extension {
  const aliasDivider = opts.aliasDivider ?? ':';

  const aliasMarker = aliasDivider.charCodeAt(0);
  const aliasMarkerCount = aliasDivider.length;
  const startMarker = codes.leftSquareBracket;
  const startMarkerCount = 2;
  const embedStartMarker = codes.exclamationMark;
  const endMarker = codes.rightSquareBracket;
  const endMarkerCount = 2;

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    let data = false;
    let alias = false;

    let aliasCursor = 0;
    let startMarkerCursor = 0;
    let endMarkerCursor = 0;

    return start;

    function start(code: Code): State | undefined {
      if (code !== startMarker && code !== embedStartMarker) return nok(code);

      if (code === startMarker) {
        effects.enter('wikiLink');
        effects.enter('wikiLinkMarker');
        return consumeStart(code);
      }

      if (code === embedStartMarker) {
        effects.enter('wikiLink', { embed: true });
        effects.enter('wikiLinkMarker', { embed: true });
        return consumeStart(code);
      }

      return nok(code);
    }

    function consumeStart(code: Code): State | undefined {
      if (startMarkerCursor === startMarkerCount) {
        effects.exit('wikiLinkMarker');
        return consumeData(code);
      }

      if (code === startMarker) {
        startMarkerCursor++;
        effects.consume(code);
        return consumeStart;
      } else if (code === embedStartMarker) {
        effects.consume(code);
        return consumeStart;
      } else {
        return nok(code);
      }
    }

    function consumeData(code: Code): State | undefined {
      if (!code || isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      effects.enter('wikiLinkData');
      effects.enter('wikiLinkTarget');
      return consumeTarget(code);
    }

    function consumeTarget(code: Code): State | undefined {
      if (code === aliasMarker) {
        if (!data) return nok(code);
        effects.exit('wikiLinkTarget');
        effects.enter('wikiLinkAliasMarker');
        return consumeAliasMarker(code);
      }

      if (code === endMarker) {
        if (!data) return nok(code);
        effects.exit('wikiLinkTarget');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (!code || isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      if (!isLineEndingOrSpace(code)) {
        data = true;
      }

      effects.consume(code);

      return consumeTarget;
    }

    function consumeAliasMarker(code: Code): State | undefined {
      if (aliasCursor === aliasMarkerCount) {
        effects.exit('wikiLinkAliasMarker');
        effects.enter('wikiLinkAlias');
        return consumeAlias(code);
      }

      if (code !== aliasMarker) {
        return nok(code);
      }

      effects.consume(code);
      aliasCursor++;

      return consumeAliasMarker;
    }

    function consumeAlias(code: Code): State | undefined {
      if (code === endMarker) {
        if (!alias) return nok(code);
        effects.exit('wikiLinkAlias');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (!code || isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      if (!isLineEndingOrSpace(code)) {
        alias = true;
      }

      effects.consume(code);

      return consumeAlias;
    }

    function consumeEnd(code: Code): State | undefined {
      if (endMarkerCursor === endMarkerCount) {
        effects.exit('wikiLinkMarker');
        effects.exit('wikiLink');
        return ok(code);
      }

      if (code !== endMarker) {
        return nok(code);
      }

      effects.consume(code);
      endMarkerCursor++;

      return consumeEnd;
    }
  };

  const wikiLinkConstruct = { tokenize: tokenize };

  return {
    text: {
      [codes.leftSquareBracket]: wikiLinkConstruct,
      [codes.exclamationMark]: wikiLinkConstruct,
    },
  };
}
