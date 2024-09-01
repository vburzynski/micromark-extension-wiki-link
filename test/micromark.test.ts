import { describe, it } from 'mocha';
import { micromark } from 'micromark';
import { expect } from 'chai';
import { stripIndent } from 'proper-tags';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table'

import { html } from '../src/index.js';
import { syntax } from '../src/syntax.js';

function basicSerializer(markdown: string, permalink: Array<string> = []) {
  return micromark(markdown, {
    extensions: [syntax()],
    htmlExtensions: [html({ permalinks: permalink })],
  });
}

describe('micromark-extension-wiki-link', function () {
  describe('wiki links', function () {
    it('parses a wiki link that has a matching permalink', function () {
      let serialized = basicSerializer('[[Wiki Link]]', ['wiki_link']);

      expect(serialized).to.equal('<p><a href="#/page/wiki_link" class="internal">Wiki Link</a></p>');
    });

    it('parses a wiki link that has no matching permalink', function () {
      let serialized = basicSerializer('[[Wiki Link]]');

      expect(serialized).to.equal('<p><a href="#/page/wiki_link" class="internal new">Wiki Link</a></p>');
    });
  });

  describe('aliases', function () {
    it('handles wiki links with aliases', function () {
      let serialized = basicSerializer('[[Real Page:Page Alias]]');

      expect(serialized).to.equal('<p><a href="#/page/real_page" class="internal new">Page Alias</a></p>');
    });

    it('handles wiki links with a custom alias divider', function () {
      let serialized = micromark('[[Real Page||Page Alias]]', 'ascii', {
        extensions: [syntax({ aliasDivider: '||' })],
        htmlExtensions: [html()],
      });

      expect(serialized).to.equal('<p><a href="#/page/real_page" class="internal new">Page Alias</a></p>');
    });
  });

  describe('file embeds and transclusions', function () {
    it('handles embedded images with a matching permalink', function () {
      const serialized = basicSerializer('![[image.jpg]]', ['image.jpg']);

      expect(serialized).to.equal('<p><a href="#/page/image.jpg" class="internal">image.jpg</a></p>');
    });

    it('handles embedded images with no matching permalink', function () {
      const serialized = basicSerializer('![[image.jpg]]');

      expect(serialized).to.equal('<p><a href="#/page/image.jpg" class="internal new">image.jpg</a></p>');
    });
  });

  describe('open wiki links', function () {
    it('handles open wiki links', function () {
      let serialized = basicSerializer('t[[\nt');

      expect(serialized).to.equal('<p>t[[\nt</p>');
    });

    it('handles open wiki links at end of file', function () {
      let serialized = basicSerializer('t [[');

      expect(serialized).to.equal('<p>t [[</p>');
    });

    it('handles open wiki links with partial data', function () {
      let serialized = basicSerializer('t [[tt\nt');

      expect(serialized).to.equal('<p>t [[tt\nt</p>');
    });

    it('handles open wiki links with partial alias divider', function () {
      let serialized = micromark('[[t|\nt', {
        extensions: [syntax({ aliasDivider: '||' })],
        htmlExtensions: [html()],
      });

      expect(serialized).to.equal('<p>[[t|\nt</p>');
    });

    it('handles open wiki links with partial alias', function () {
      let serialized = basicSerializer('[[t:\nt');

      expect(serialized).to.equal('<p>[[t:\nt</p>');
    });
  });

  describe('configuration options', function () {
    it('uses pageResolver', function () {
      let identity = (name: string) => [name];

      let serialized = micromark('[[A Page]]', {
        extensions: [syntax()],
        htmlExtensions: [
          html({
            pageResolver: identity,
            permalinks: ['A Page'],
          }),
        ],
      });

      expect(serialized).to.equal('<p><a href="#/page/A Page" class="internal">A Page</a></p>');
    });

    it('uses newClassName', function () {
      let serialized = micromark('[[A Page]]', {
        extensions: [syntax()],
        htmlExtensions: [
          html({
            newClassName: 'new_page',
          }),
        ],
      });

      expect(serialized).to.equal('<p><a href="#/page/a_page" class="internal new_page">A Page</a></p>');
    });

    it('uses hrefTemplate', function () {
      let hrefTemplate = (permalink: string) => permalink;
      let serialized = micromark('[[A Page]]', {
        extensions: [syntax()],
        htmlExtensions: [
          html({
            hrefTemplate: hrefTemplate,
          }),
        ],
      });

      expect(serialized).to.equal('<p><a href="a_page" class="internal new">A Page</a></p>');
    });

    it('uses wikiLinkClassName', function () {
      let serialized = micromark('[[A Page]]', {
        extensions: [syntax()],
        htmlExtensions: [
          html({
            wikiLinkClassName: 'wiki_link',
            permalinks: ['a_page'],
          }),
        ],
      });

      expect(serialized).to.equal('<p><a href="#/page/a_page" class="wiki_link">A Page</a></p>');
    });
  });

  describe('compatibility with GFM Tables', function () {
    function serialize(markdown: string) {
      return micromark(markdown, {
        extensions: [gfmTable(), syntax({ aliasDivider: '|' })],
        htmlExtensions: [gfmTableHtml(), html()]
      });
    }

    it('handles a basic wikilink', function () {
      const serialized = serialize(stripIndent`
        | header | header |
        | --- | --- |
        | [[wikilink]] | text |
      `);

      expect(serialized).to.equal(stripIndent`
        <table>
        <thead>
        <tr>
        <th>header</th>
        <th>header</th>
        </tr>
        </thead>
        <tbody>
        <tr>
        <td><a href="#/page/wikilink" class="internal new">wikilink</a></td>
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
      `
      const serialized = serialize(md);

      expect(serialized).to.equal(stripIndent`
        <table>
        <thead>
        <tr>
        <th>header</th>
        <th>header</th>
        </tr>
        </thead>
        <tbody>
        <tr>
        <td><a href="#/page/wikilink" class="internal new">alias</a></td>
        <td>text</td>
        </tr>
        </tbody>
        </table>
      `);
    });
  })
});
