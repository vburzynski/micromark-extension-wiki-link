import { describe, it } from 'mocha';
import { expect } from 'chai';
import { micromark } from 'micromark';
import { stripIndent } from 'proper-tags';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table';

import { internalLinkHtml, internalLinkSyntax } from '../src/index.js';

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
