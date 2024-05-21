import { html } from './html';

const codes = {
  carriageReturn: -5,
  lineFeed: -4,
  carriageReturnLineFeed: -3,
  horizontalTab: -2,
  virtualSpace: -1,
  nul: 0,
  eof: null,
  space: 32,
  exclamationMark: 33, // `!`
  colon: 58, // `:`
  leftSquareBracket: 91, // `[`
  rightSquareBracket: 93, // `]`
};

function isLineEndingOrSpace(code) {
  return code < codes.nul || code === codes.space;
}

function isLineEnding(code) {
  return code < codes.horizontalTab;
}

function wikiLink(opts = {}) {
  const aliasDivider = opts.aliasDivider || ':';

  const aliasMarker = aliasDivider.charCodeAt(0);
  const aliasMarkerCount = aliasDivider.length;
  const startMarker = codes.leftSquareBracket;
  const startMarkerCount = 2;
  const embedStartMarker = codes.exclamationMark;
  const endMarker = codes.rightSquareBracket;
  const endMarkerCount = 2;

  function tokenize(effects, ok, nok) {
    var data;
    var alias;

    var aliasCursor = 0;
    var startMarkerCursor = 0;
    var endMarkerCursor = 0;

    return start;

    function start(code) {
      if (code === startMarker) {
        effects.enter('wikiLink');
        effects.enter('wikiLinkMarker');

        return consumeStart(code);
      } else if (code === embedStartMarker) {
        effects.enter('wikiLink', { isType: 'embed' });
        effects.enter('wikiLinkMarker', { isType: 'embed' });

        return consumeStart(code);
      } else {
        return nok(code);
      }
    }

    function consumeStart(code) {
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

    function consumeData(code) {
      if (isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      effects.enter('wikiLinkData');
      effects.enter('wikiLinkTarget');
      return consumeTarget(code);
    }

    function consumeTarget(code) {
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

      if (isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      if (!isLineEndingOrSpace(code)) {
        data = true;
      }

      effects.consume(code);

      return consumeTarget;
    }

    function consumeAliasMarker(code) {
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

    function consumeAlias(code) {
      if (code === endMarker) {
        if (!alias) return nok(code);
        effects.exit('wikiLinkAlias');
        effects.exit('wikiLinkData');
        effects.enter('wikiLinkMarker');
        return consumeEnd(code);
      }

      if (isLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      if (!isLineEndingOrSpace(code)) {
        alias = true;
      }

      effects.consume(code);

      return consumeAlias;
    }

    function consumeEnd(code) {
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
  }

  var wikiLinkConstruct = { tokenize: tokenize };

  return {
    text: {
      [codes.leftSquareBracket]: wikiLinkConstruct,
      [codes.exclamationMark]: wikiLinkConstruct,
    },
  };
}

export { wikiLink as syntax, html };
