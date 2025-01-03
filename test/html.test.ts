import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('html href', function () {
  it('uses a matching permalink when provided', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="page/a_page" class="internal">A Page</a></p>',
      htmlOptions: {
        permalinks: ['a_page'],
      },
    });
  });

  describe('when the pageResolver returns multiple candidates', function () {
    it('uses the first permalink that matches one of the resolved page references', function () {
      serializationTest({
        markdown: '[[A Page]]',
        expected: '<p><a href="page/a_page" class="internal">A Page</a></p>',
        htmlOptions: {
          pageResolver: () => ['a_different_page', 'a_page'],
          permalinks: ['root', 'a_page'],
        },
      });
    });
  });

  it('uses the first resolved page reference when no matches are found', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="page/root" class="internal broken-link">A Page</a></p>',
      htmlOptions: {
        pageResolver: () => ['root', 'a_page'],
        permalinks: ['a_different_page'],
      },
    });
  });
});

describe('html configuration options', function () {
  it('accepts a replacement brokenLinkClassName', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="page/a_page" class="internal new_page">A Page</a></p>',
      htmlOptions: {
        brokenLinkClassName: 'new_page',
      },
    });
  });

  it('accepts a replacement wikiLinkClassName', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="page/a_page" class="wiki_link">A Page</a></p>',
      htmlOptions: {
        wikiLinkClassName: 'wiki_link',
        permalinks: ['a_page'],
      },
    });
  });

  it('accepts a pageResolver replacement', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="page/A Page" class="internal">A Page</a></p>',
      htmlOptions: {
        pageResolver: (name: string) => [name],
        permalinks: ['A Page'],
      },
    });
  });

  it('accepts a replacement hrefTemplate', function () {
    serializationTest({
      markdown: '[[A Page]]',
      expected: '<p><a href="a_page" class="internal broken-link">A Page</a></p>',
      htmlOptions: {
        hrefTemplate: (permalink: string, _anchor: string | undefined) => permalink,
      },
    });
  });
});
