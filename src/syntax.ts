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
import { WikiLinkSyntaxConfig, WikiLinkSyntaxOptions } from './types.js';
import { markdownLineEnding } from 'micromark-util-character';

/*
 * This internal link (wiki link) syntax tokenization aims to be compatible with Obsidian's implementation.
 * It also offers configuration options that may support other wiki link grammars
 */

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    // (required) encloses the entire wikilink
    wikiLink: 'wikiLink',

    // (required) encloses the opening or closing fences
    // - there must be an opening fence and a closing fence
    wikiLinkFence: 'wikiLinkFence'

    // (optional) encloses the destination
    // - may be omitted when an anchor is present
    // - when omitted, the current document is implicitly assumed to be the destination for the internal link
    // - shortest path destination: a page title (by convention this is typically the filename omitting the extension)
    // - relative path destination: relative path to the targeted file
    // - absolute path destination: absolute path to the target file with `/` at the beginning denoting
    wikiLinkDestination: 'wikiLinkDestination'

    // (optional) encloses the anchor marker (#)
    // - required if no destination value is provided
    // - when present without a destination, it signals presence of a reference to a heading or block id
    // - the anchor marker must be paired with either a heading or block-id
    // - when an anchor marker is paired with a block reference; only one pair may appear in the internal link
    // - when an anchor marker is paired with a heading, it may be followed up with any recursive subheading
    // - a sequence of marker+heading pairs may be longer than 2 pairs
    wikiLinkAnchor: 'wikiLinkAnchor',

    // (optional) encloses the heading value which follows an anchor marker
    // - must be preceeded by an anchor marker
    wikiLinkHeading: 'wikiLinkHeading',

    // (optional) encloses the block id value which follows an anchor marker
    // - must be preceeded by an anchor marker
    wikiLinkBlockReference: 'wikiLinkBlockReference',
    wikiLinkBlockMarker: 'wikiLinkBlockMarker',
    wikiLinkBlockId: 'wikiLinkBlockId',

    // (optional) encloses the alias marker
    // - when a heading is present, the alias marker must appear after the last heading
    // - when no heading is present, it appears after the destination
    wikiLinkAliasMarker: 'wikiLinkAliasMarker'

    // (optional) encloses the alias value
    // - appears after the alias marker
    // - in Obsidian, this value is either a custom label, or an alias matching a string in the aliases property
    wikiLinkAlias: 'wikiLinkAlias'
  }
}

// types of supported internal links...
//
// [[destination]]                     | targets a destination (a destination can take the forms below)
//   [[filename]]                      |   shortest path destination
//   [[./subfolder/filename]]          |   relative path destination targeting file inside subfolder
//   [[./filename]]                    |   relative path destination targeting sibling file
//   [[../filename]]                   |   relative path destination targeting file inside parent folder
//   [[/folder/filename]]              |   absolute path destination
// [[#heading]]                        | targets a heading in the current file
// [[#heading#subheading]]             | targets a subheading in the current file
// [[#h1#h2#h3#h4#h5#h6]]              | targets a nested subheading in the current file
// [[destination#heading]]             | targets a heading in another file
// [[destination#heading#subheading]]  | targets a subheading in another file
// [[destination#h1#h2#h3#h4#h5#h6]]   | targets a nested subheading in another file
// [[#^block-id]]                      | targets a block id in the current file
// [[destination#^block-id]]           | targets a block id in another file
// [[destination|alias]]               | aliased link targeting a destination
// [[destination\|alias]]              | aliased link targeting a destination and appearing inside a GFM table cell
// [[#heading|alias]]                  | aliased link targeting a heading in the current document
// [[destination#heading|alias]]       | aliased link targeting a heading in another document
// [[#^block-id|alias]]                | aliased link targeting a block id in the current document
// [[destination#^block-id|alias]]     | aliased link targeting a block id in another document
//
// types of supported embeds and transclusions...
//
// TODO: ![[destination]]              | transclude an entire note/page
// TODO: ![[destination#anchor]]       | transclude everything under the header Anchor
// TODO: ![[destination#^b15695]]      | transclude block with ID reference ^b15695
// TODO: ![[imagepath.ext]]            | embed a file
// TODO: ![[imagepath.jpg]]            | embed an image
// TODO: ![[imagepath.jpg|100x145]]    | embed an image with dimensions (100px x 145px)
// TODO: ![[imagepath.jpg|100]]        | embed an image setting the width to 100px
// TODO: ![[imagepath.pdf#page=3]]     | embed pdf opened to specific page
// TODO: ![[imagepath.pdf#height=400]] | embed pdf and set viewport height

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

const blockIdentifierRegex: RegExp = /[-A-Za-z0-9]/;

function check(regex: RegExp, code: Code): boolean {
  return code !== null && code > -1 && regex.test(String.fromCharCode(code));
}

function blockIdentifier(code: Code): boolean {
  return check(blockIdentifierRegex, code);
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
      effects.exit('wikiLinkDestination');
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
 * A construct to tokenize the escaped version of a vertical bar used as an alias divider (when inside a GRM table cell)
 */
const escapedVerticalBarAliasDivider: Construct = { tokenize: tokenizeEscapedPipeAliasMarker, partial: true };

const defaultConfig: WikiLinkSyntaxConfig = {
  aliasDivider: '|',
  openingFence: '[[',
  closingFence: ']]',
}

export function internalLinkSyntax(options: WikiLinkSyntaxOptions = {}): Extension {
  const embedModifier = codes.exclamationMark;
  const config: WikiLinkSyntaxConfig = { ...defaultConfig, ...options }

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
      effects.enter('wikiLinkFence');

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
        effects.enter('wikiLinkFence', { embed: true });
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
      effects.exit('wikiLinkFence');

      if (code === codes.numberSign) {
        return anchor(code)
      }

      return beforeDestination(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^
     * ```
     */
    function beforeDestination(code: Code): State | undefined {
      if (markdownLineEnding(code) || isEndOfFile(code)) {
        return nok(code);
      }

      effects.enter('wikiLinkDestination');

      return destination(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^^^^^^
     * ```
     */
    function destination(code: Code): State | undefined {
      // when we've reached an anchor marker
      if (code === codes.numberSign) {
        effects.exit('wikiLinkDestination');
        return anchor(code)
      }

      // when code matches the first code of the alias divider
      if (atAliasDivider(code)) {
        effects.exit('wikiLinkDestination');
        return beforeAliasDivider(code);
      }

      // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
      if (config.aliasDivider === '|' && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, betweenDestinationAndAliasDivider, destination)(code);
      }

      // when the current code matches the first code of the closing fence
      if (atClosingFence(code)) {
        effects.exit('wikiLinkDestination');
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

      return destination;
    }

    function betweenDestinationAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkDestination');
      return beforeAliasDivider(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >           ^
     * ```
     */
    function anchor(code: Code): State | undefined {
      if (code === codes.numberSign) {
        effects.enter('wikiLinkAnchor');
        effects.consume(code);
        effects.exit('wikiLinkAnchor');
        return anchorFork;
      }

      return nok(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >            ^
     * ```
     */
    function anchorFork(code: Code): State | undefined {
      // when the first charater is a caret, then this is a block reference anchor, not a heading anchor
      if (code === codes.caret) {
        effects.enter('wikiLinkBlockReference');
        effects.enter('wikiLinkBlockMarker')
        effects.consume(code);
        effects.exit('wikiLinkBlockMarker')
        effects.enter('wikiLinkBlockId')
        return blockReference;
      }

      effects.enter('wikiLinkHeading');
      return heading(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor#second|alias]]
     * >            ^^^^^^
     * ```
     */
    function heading(code: Code): State | undefined {
      // this is the start of a new heading chunk
      if (code == codes.numberSign) {
        effects.exit('wikiLinkHeading');
        return anchor(code);
      }

      // exit when code matches the first code of the alias divider
      if (atAliasDivider(code)) {
        effects.exit('wikiLinkHeading');
        return beforeAliasDivider(code);
      }

      // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
      if (config.aliasDivider === '|' && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, betweenHeadingAndAliasDivider, heading)(code);
      }

      // when the current code matches the first code of the closing fence
      if (atClosingFence(code)) {
        effects.exit('wikiLinkHeading');
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

      return heading;
    }

    function betweenHeadingAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkHeading');
      return beforeAliasDivider(code);
    }

    /**
     * ```markdown
     * > | [[target#^block-id|alias]]
     * >            ^^^^^^^^^
     * ```
     */
    function blockReference(code: Code): State | undefined {
      // exit when code matches the first code of the alias divider
      if (atAliasDivider(code)) {
        effects.exit('wikiLinkBlockId');
        effects.exit('wikiLinkBlockReference');
        return beforeAliasDivider(code);
      }

      // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
      if (config.aliasDivider === '|' && code === codes.backslash) {
        return effects.attempt(escapedVerticalBarAliasDivider, betweenBlockReferenceAndAliasDivider, blockReference)(code);
      }

      // when the current code matches the first code of the closing fence
      if (atClosingFence(code)) {
        effects.exit('wikiLinkBlockId');
        effects.exit('wikiLinkBlockReference');
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

      if (blockIdentifier(code)) {
        effects.consume(code);
        return blockReference;
      }

      return nok(code);
    }

    function betweenBlockReferenceAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkBlockId');
      effects.exit('wikiLinkBlockReference');
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
        effects.enter('wikiLinkFence');
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
      effects.exit('wikiLinkFence');
      effects.exit('wikiLink');

      return ok(code);
    }
  }

  const wikiLinkConstruct: Construct = {
    name: 'wikilink',
    tokenize: tokenize,
    concrete: true,
  };

  const wikiLinkTextConstructRecord : ConstructRecord = {
    // internal links start with a square bracket
    [codes.leftSquareBracket]: wikiLinkConstruct,
    // embed links start with an exclamation mark
    [codes.exclamationMark]: wikiLinkConstruct,
  };

  return {
    text: wikiLinkTextConstructRecord,
  };
}
