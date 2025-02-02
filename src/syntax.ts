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
import { markdownLineEnding as atMarkdownLineEnding } from 'micromark-util-character';

/*
 * This internal link (wiki link) syntax tokenization aims to be compatible with Obsidian's implementation.
 * It also offers configuration options that may support other wiki link grammars
 */

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLinkEmbed: 'wikiLinkEmbed';

    // (required) encloses the entire wikilink
    wikiLink: 'wikiLink';

    // (required) encloses the opening or closing fences
    // - there must be an opening fence and a closing fence
    wikiLinkFence: 'wikiLinkFence';

    // (optional) encloses the destination
    // - may be omitted when an anchor is present
    // - when omitted, the current document is implicitly assumed to be the destination for the internal link
    // - shortest path destination: a page title (by convention this is typically the filename omitting the extension)
    // - relative path destination: relative path to the targeted file
    // - absolute path destination: absolute path to the target file with `/` at the beginning denoting
    wikiLinkDestination: 'wikiLinkDestination';

    // (optional) encloses the anchor marker (#)
    // - required if no destination value is provided
    // - when present without a destination, it signals presence of a reference to a heading or block id
    // - the anchor marker must be paired with either a heading or block-id
    // - when an anchor marker is paired with a block reference; only one pair may appear in the internal link
    // - when an anchor marker is paired with a heading, it may be followed up with any recursive subheading
    // - a sequence of marker+heading pairs may be longer than 2 pairs
    wikiLinkAnchor: 'wikiLinkAnchor';

    // (optional) encloses the heading value which follows an anchor marker
    // - must be preceeded by an anchor marker
    wikiLinkHeading: 'wikiLinkHeading';

    // (optional) encloses the block id value which follows an anchor marker
    // - must be preceeded by an anchor marker
    wikiLinkBlockReference: 'wikiLinkBlockReference';
    wikiLinkBlockMarker: 'wikiLinkBlockMarker';
    wikiLinkBlockId: 'wikiLinkBlockId';

    // (optional) encloses the alias marker
    // - when a heading is present, the alias marker must appear after the last heading
    // - when no heading is present, it appears after the destination
    wikiLinkAliasMarker: 'wikiLinkAliasMarker';

    // (optional) encloses the alias value
    // - appears after the alias marker
    // - in Obsidian, this value is either a custom label, or an alias matching a string in the aliases property
    wikiLinkAlias: 'wikiLinkAlias';
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

const blockIdentifierRegex: RegExp = /[-A-Za-z0-9]/;

function check(regex: RegExp, code: Code): boolean {
  return code !== null && code > -1 && regex.test(String.fromCharCode(code));
}

// Matches a carriage return, line feed, carriage return line feed, virtual space, end of file, or space character
const atLineEndingTabOrSpace = (code: Code) => code && (code < codes.nul || code === codes.space);
const atNonWhitespace = (code: Code) => !atLineEndingTabOrSpace(code);
const atEndOfFile = (code: Code) => code === codes.eof;
const atBlockIdentifier = (code: Code) => check(blockIdentifierRegex, code);
const atAnchorDivider = (code: Code) => code === codes.numberSign;
const atAliasDivider = (code: Code) => code === codes.verticalBar;
const atEmbedModifier = (code: Code) => code === codes.exclamationMark;

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
    return atAliasDivider(code) ? ok(code) : nok(code);
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
};

export function internalLinkSyntax(options: WikiLinkSyntaxOptions = {}): Extension {
  const config: WikiLinkSyntaxConfig = { ...defaultConfig, ...options };

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    const self = this;

    let containsTarget = false;
    let containsAlias = false;

    let openingMarkerSize = 0;
    let closingMarkerSize = 0;
    let aliasSize = 0;

    const atEscapeCode = (code: Code) => code === codes.backslash;
    const atBlockMarker = (code: Code) => code === codes.caret;
    const atAnchorMarker = (code: Code) => code === codes.numberSign;

    const atOpeningFence = (code: Code) => code === config.openingFence.charCodeAt(0);
    const atNextOpeningFenceCode = (code: Code) => code === config.openingFence.charCodeAt(openingMarkerSize);
    const atFirstCodeAfterOpeningFence = () => openingMarkerSize === config.openingFence.length;

    const atAliasDivider = (code: Code) => code === config.aliasDivider.charCodeAt(0);
    const atNextAliasDividerCode = (code: Code) => code === config.aliasDivider.charCodeAt(aliasSize)
    const atFirstCodeAfterAliasDivider = () => aliasSize === config.aliasDivider.length;

    const atClosingFence = (code: Code) => code === config.closingFence.charCodeAt(0);
    const atNextClosingFenceCode = (code: Code) => code === config.closingFence.charCodeAt(closingMarkerSize);
    const atFirstCodeAfterClosingFence = () => closingMarkerSize === config.closingFence.length;

    // when using a vertical bar as an alias divider, the wikilinks inside of GFM tables need to escape the vertical bar
    const shouldAttemptTableFix = (code: Code) => config.aliasDivider === '|' && atEscapeCode(code);

    return start;

    /**
     * Determine if we're starting an internal link (wiki link) or an embed/transclusion
     */
    function start(code: Code): State | undefined {
      if (atEmbedModifier(code)) return startEmbed(code);
      if (atOpeningFence(code)) return startWikiLink(code);

      return nok(code);
    }

    /**
     * Embeds and transclusions start with an exclamation mark
     * ```markdown
     * > | ![[target#anchor|alias]]
     * >   ^
     * ```
     */
    function startEmbed(code: Code) {
      effects.enter('wikiLinkEmbed');
      effects.consume(code);
      effects.exit('wikiLinkEmbed');

      return startWikiLink
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
     * > | [[target#anchor|alias]]
     * >   ^^
     * ```
     */
    function openingFence(code: Code): State | undefined {
      if (atFirstCodeAfterOpeningFence()) return afterOpeningFence(code);
      if (atNextOpeningFenceCode(code)) return consumeFenceCode(code);

      return nok(code);
    }

    function consumeFenceCode(code: Code): State | undefined {
      effects.consume(code);
      openingMarkerSize++;

      return openingFence;
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^
     * > | [[#anchor|alias]]
     * >     ^
     * ```
     */
    function afterOpeningFence(code: Code): State | undefined {
      effects.exit('wikiLinkFence');

      if (atAnchorDivider(code)) {
        return anchor(code);
      } else {
        return beforeDestination(code);
      }
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >     ^
     * ```
     */
    function beforeDestination(code: Code): State | undefined {
      if (atMarkdownLineEnding(code) || atEndOfFile(code)) return nok(code);

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
      if (atAnchorDivider(code)) return exitDesinationAndStartAnchor(code);
      if (atAliasDivider(code)) return exitDesinationAndStartAliasDivider(code);
      if (shouldAttemptTableFix(code)) return attemptEscapedAliasDividerOrResumeDestination(code);
      if (atClosingFence(code)) return exitDestinationAndStartClosingFence(code);
      if (atMarkdownLineEnding(code) || atEndOfFile(code)) return nok(code);

      if (atNonWhitespace(code)) containsTarget = true;

      effects.consume(code);

      return destination;
    }

    function exitDesinationAndStartAnchor(code: Code): State | undefined {
      effects.exit('wikiLinkDestination');
      return anchor(code);
    }

    function exitDesinationAndStartAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkDestination');
      return beforeAliasDivider(code);
    }

    function attemptEscapedAliasDividerOrResumeDestination(code: Code): State | undefined {
      return effects.attempt(escapedVerticalBarAliasDivider, betweenDestinationAndAliasDivider, destination)(code);
    }

    function betweenDestinationAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkDestination');
      return beforeAliasDivider(code);
    }

    function exitDestinationAndStartClosingFence(code: Code): State | undefined {
      effects.exit('wikiLinkDestination');
      return beforeClosingFence(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >           ^
     * ```
     */
    function anchor(code: Code): State | undefined {
      if (atAnchorDivider(code)) {
        effects.enter('wikiLinkAnchor');
        effects.consume(code);
        effects.exit('wikiLinkAnchor');
        return anchorFork;
      }

      return nok(code);
    }

    /**
     * Determines if the next token should be a block reference or heading
     * ```markdown
     * > | [[target#anchor|alias]]
     * >            ^
     * ```
     */
    function anchorFork(code: Code): State | undefined {
      if (atBlockMarker(code)) {
        return blockReference(code);
      } else {
        return startHeading(code);
      }
    }

    /**
     * A block reference contains a block marker followed by a block identifier
     */
    function blockReference(code: Code): State | undefined {
      effects.enter('wikiLinkBlockReference');
      effects.enter('wikiLinkBlockMarker');
      effects.consume(code);
      effects.exit('wikiLinkBlockMarker');
      effects.enter('wikiLinkBlockId');

      return blockIdentifier;
    }

    function startHeading(code: Code): State | undefined {
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
      if (atAnchorMarker(code)) return exitHeadingAndStartAnchor(code);
      if (atAliasDivider(code)) return exitHeadingAndStartAliasDivider(code);
      if (shouldAttemptTableFix(code)) attemptEscapedAliasDividerOrResumeHeading(code);
      if (atClosingFence(code)) return exitHeadingAndStartClosingFence(code);
      if (atMarkdownLineEnding(code) || atEndOfFile(code)) return nok(code);

      return continueHeading(code);
    }

    function exitHeadingAndStartAnchor(code: Code) {
      effects.exit('wikiLinkHeading');
      return anchor(code);
    }

    function exitHeadingAndStartAliasDivider(code: Code) {
      effects.exit('wikiLinkHeading');
      return beforeAliasDivider(code);
    }

    function attemptEscapedAliasDividerOrResumeHeading(code: Code) {
      return effects.attempt(escapedVerticalBarAliasDivider, betweenHeadingAndAliasDivider, heading)(code);
    }

    function betweenHeadingAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkHeading');
      return beforeAliasDivider(code);
    }

    function exitHeadingAndStartClosingFence(code: Code) {
      effects.exit('wikiLinkHeading');
      return beforeClosingFence(code);
    }

    function continueHeading(code: Code) {
      if (atNonWhitespace(code)) containsTarget = true;
      effects.consume(code);
      return heading;
    }

    /**
     * ```markdown
     * > | [[target#^block-id|alias]]
     * >            ^^^^^^^^^
     * ```
     */
    function blockIdentifier(code: Code): State | undefined {
      if (atAliasDivider(code)) return exitBlockIdentifierAndStartAliasDivider(code);
      if (shouldAttemptTableFix(code)) attemptEscapedAliasDividerOrResumeBlockIdentifier(code);
      if (atClosingFence(code)) return exitBlockIdentifierAndStartClosingFence(code);
      if (atMarkdownLineEnding(code) || atEndOfFile(code)) return nok(code);
      if (atBlockIdentifier(code)) return continueBlockIdentifier(code);

      return nok(code);
    }

    function exitBlockIdentifierAndStartAliasDivider(code: Code) {
      effects.exit('wikiLinkBlockId');
      effects.exit('wikiLinkBlockReference');
      return beforeAliasDivider(code);
    }

    function attemptEscapedAliasDividerOrResumeBlockIdentifier(code: Code) {
      return effects.attempt(
        escapedVerticalBarAliasDivider,
        betweenBlockReferenceAndAliasDivider,
        blockIdentifier
      )(code);
    }

    function exitBlockIdentifierAndStartClosingFence(code: Code) {
      effects.exit('wikiLinkBlockId');
      effects.exit('wikiLinkBlockReference');
      return beforeClosingFence(code);
    }

    function betweenBlockReferenceAndAliasDivider(code: Code): State | undefined {
      effects.exit('wikiLinkBlockId');
      effects.exit('wikiLinkBlockReference');
      return beforeAliasDivider(code);
    }

    function continueBlockIdentifier(code: Code) {
      if (atNonWhitespace(code)) containsTarget = true;
      effects.consume(code);
      return blockIdentifier;
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                 ^
     * ```
     */
    function beforeAliasDivider(code: Code): State | undefined {
      // when no target content was encountered before the alias divider, the syntax is invalid
      if (!containsTarget) return nok(code);

      effects.enter('wikiLinkAliasMarker');
      return aliasDivider(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                  ^
     * ```
     */
    function aliasDivider(code: Code): State | undefined {
      if (atFirstCodeAfterAliasDivider()) return exitAliasDividerAndStartAlias(code);
      if (!atNextAliasDividerCode(code)) return nok(code);

      effects.consume(code);
      aliasSize++;

      return aliasDivider;
    }

    function exitAliasDividerAndStartAlias(code: Code) {
      effects.exit('wikiLinkAliasMarker');
      return beforeAlias(code);
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
      if (atClosingFence(code)) return afterAlias(code);
      if (atMarkdownLineEnding(code) || atEndOfFile(code)) return nok(code);

      if (atNonWhitespace(code)) containsAlias = true;

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
      if (!containsAlias) return nok(code);

      effects.exit('wikiLinkAlias');
      return beforeClosingFence(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                       ^
     * ```
     */
    function beforeClosingFence(code: Code): State | undefined {
      // ensure we have at least a target at this point, otherwise the grammar is invalid
      if (!containsTarget) return nok(code);

      effects.enter('wikiLinkFence');
      return closingFence(code);
    }

    /**
     * ```markdown
     * > | [[target#anchor|alias]]
     * >                        ^^
     * ```
     */
    function closingFence(code: Code): State | undefined {
      if (atFirstCodeAfterClosingFence()) return afterClosingFence(code);
      if (!atNextClosingFenceCode(code)) return nok(code);

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

  const wikiLinkTextConstructRecord: ConstructRecord = {
    // internal links start with a square bracket
    [codes.leftSquareBracket]: wikiLinkConstruct,
    // embed links start with an exclamation mark
    [codes.exclamationMark]: wikiLinkConstruct,
  };

  return {
    text: wikiLinkTextConstructRecord,
  };
}
