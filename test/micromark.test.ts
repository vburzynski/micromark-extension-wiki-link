import { describe, it } from 'mocha';
import { expect } from 'chai';
import { micromark } from 'micromark';
import { stripIndent } from 'proper-tags';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table';

import { internalLinkHtml, internalLinkSyntax, WikiLinkSyntaxOptions } from '../src/index.js';

function serialize(markdown: string, options: WikiLinkSyntaxOptions = {}, permalink: Array<string> = []) {
  return micromark(markdown, {
    extensions: [internalLinkSyntax(options)],
    htmlExtensions: [internalLinkHtml({ permalinks: permalink })],
  });
}

describe('micromark-extension-wiki-link', function () {
  describe('basic wiki links', function () {
    it('parses a wiki link that has a matching permalink', function () {
      let html = serialize('[[Wiki Link]]', {}, ['wiki_link']);

      expect(html).to.equal('<p><a href="page/wiki_link" class="internal">Wiki Link</a></p>');
    });

    it('parses a wiki link that has no matching permalink', function () {
      let html = serialize('[[Wiki Link]]');

      expect(html).to.equal('<p><a href="page/wiki_link" class="internal broken-link">Wiki Link</a></p>');
    });
  });

  describe('aliases', function () {
    it('handles wiki links with aliases', function () {
      let html = serialize('[[Real Page:Page Alias]]');

      expect(html).to.equal('<p><a href="page/real_page" class="internal broken-link">Page Alias</a></p>');
    });

    it('handles wiki links with a custom alias divider', function () {
      let html = serialize('[[Real Page||Page Alias]]', { aliasDivider: '||' });

      expect(html).to.equal('<p><a href="page/real_page" class="internal broken-link">Page Alias</a></p>');
    });
  });

  describe('internal link with anchor', function () {
    it('handles wiki links pointint to an anchor in the same document', function () {
      let html = serialize('[[#anchor]]');

      expect(html).to.equal('<p><a href="#anchor" class="internal">anchor</a></p>');
    });

    it('handles wiki links pointing to an anchor in another document', function () {
      let html = serialize('[[title#anchor]]', {}, ['title']);

      expect(html).to.equal('<p><a href="page/title#anchor" class="internal">anchor</a></p>');
    });
  });

  describe('file embeds and transclusions', function () {
    it('handles embedded images with a matching permalink', function () {
      const html = serialize('![[image.jpg]]', {}, ['image.jpg']);

      expect(html).to.equal('<p><a href="page/image.jpg" class="internal">image.jpg</a></p>');
    });

    it('handles embedded images with no matching permalink', function () {
      const html = serialize('![[image.jpg]]');

      expect(html).to.equal('<p><a href="page/image.jpg" class="internal broken-link">image.jpg</a></p>');
    });
  });

  describe('open wiki links', function () {
    it('handles open wiki links', function () {
      let html = serialize('t[[\nt');

      expect(html).to.equal('<p>t[[\nt</p>');
    });

    it('handles open wiki links at end of file', function () {
      let html = serialize('t [[');

      expect(html).to.equal('<p>t [[</p>');
    });

    it('handles open wiki links with partial data', function () {
      let html = serialize('t [[tt\nt');

      expect(html).to.equal('<p>t [[tt\nt</p>');
    });

    it('handles open wiki links with partial alias divider', function () {
      let html = micromark('[[t|\nt', {
        extensions: [internalLinkSyntax({ aliasDivider: '||' })],
        htmlExtensions: [internalLinkHtml()],
      });

      expect(html).to.equal('<p>[[t|\nt</p>');
    });

    it('handles open wiki links with partial alias', function () {
      let html = serialize('[[t:\nt');

      expect(html).to.equal('<p>[[t:\nt</p>');
    });
  });

  describe('configuration options', function () {
    it('uses pageResolver', function () {
      let identity = (name: string) => [name];

      let html = micromark('[[A Page]]', {
        extensions: [internalLinkSyntax()],
        htmlExtensions: [
          internalLinkHtml({
            pageResolver: identity,
            permalinks: ['A Page'],
          }),
        ],
      });

      expect(html).to.equal('<p><a href="page/A Page" class="internal">A Page</a></p>');
    });

    it('uses brokenLinkClassName', function () {
      let html = micromark('[[A Page]]', {
        extensions: [internalLinkSyntax()],
        htmlExtensions: [
          internalLinkHtml({
            brokenLinkClassName: 'new_page',
          }),
        ],
      });

      expect(html).to.equal('<p><a href="page/a_page" class="internal new_page">A Page</a></p>');
    });

    it('uses hrefTemplate', function () {
      let hrefTemplate = (permalink: string) => permalink;
      let html = micromark('[[A Page]]', {
        extensions: [internalLinkSyntax()],
        htmlExtensions: [
          internalLinkHtml({
            hrefTemplate: hrefTemplate,
          }),
        ],
      });

      expect(html).to.equal('<p><a href="a_page" class="internal broken-link">A Page</a></p>');
    });

    it('uses wikiLinkClassName', function () {
      let html = micromark('[[A Page]]', {
        extensions: [internalLinkSyntax()],
        htmlExtensions: [
          internalLinkHtml({
            wikiLinkClassName: 'wiki_link',
            permalinks: ['a_page'],
          }),
        ],
      });

      expect(html).to.equal('<p><a href="page/a_page" class="wiki_link">A Page</a></p>');
    });
  });

  describe('compatibility with GFM Tables', function () {
    function serialize(markdown: string) {
      return micromark(markdown, {
        extensions: [gfmTable(), internalLinkSyntax({ aliasDivider: '|' })],
        htmlExtensions: [gfmTableHtml(), internalLinkHtml()],
      });
    }

    it('handles a basic wikilink', function () {
      const html = serialize(stripIndent`
        | header | header |
        | --- | --- |
        | [[wikilink]] | text |
      `);

      expect(html).to.equal(stripIndent`
        <table>
        <thead>
        <tr>
        <th>header</th>
        <th>header</th>
        </tr>
        </thead>
        <tbody>
        <tr>
        <td><a href="page/wikilink" class="internal broken-link">wikilink</a></td>
        <td>text</td>
        </tr>
        </tbody>
        </table>
      `);
    });

    it('handles a wikilink with an Obsidian style alias', function () {
      const md = stripIndent`
        | header              | header |
        | ------------------- | ------ |
        | [[wikilink\\|alias]] | text   |
      `;
      const html = serialize(md);

      expect(html).to.equal(stripIndent`
        <table>
        <thead>
        <tr>
        <th>header</th>
        <th>header</th>
        </tr>
        </thead>
        <tbody>
        <tr>
        <td><a href="page/wikilink" class="internal broken-link">alias</a></td>
        <td>text</td>
        </tr>
        </tbody>
        </table>
      `);
    });
  });
});
