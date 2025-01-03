import { describe, it } from 'mocha';
import { expect } from 'chai';
import { micromark } from 'micromark';
import { stripIndent } from 'proper-tags';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table';

import { internalLinkHtml, internalLinkSyntax } from '../src/index.js';
import { serializationTest } from './support/serializationTest.js';

describe('basic wiki links', function () {
  it('parses a wiki link that has a matching permalink', function () {
    serializationTest({
      markdown: '[[Wiki Link]]',
      expected: '<p><a href="page/wiki_link" class="internal">Wiki Link</a></p>',
      htmlOptions: { permalinks: ['wiki_link'] },
    })
  });

  it('parses a wiki link that has no matching permalink', function () {
    serializationTest({
      markdown: '[[Wiki Link]]',
      expected: '<p><a href="page/wiki_link" class="internal broken-link">Wiki Link</a></p>',
    })
  });
});
