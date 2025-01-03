import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('internal link aliases (or labels)', function () {
  it('renders the alias as the display text', function () {
    serializationTest({
      markdown: '[[Real Page|Page Alias]]',
      expected: '<p><a href="page/real_page" class="internal broken-link">Page Alias</a></p>',
    })
  });

  it('handles configuring the alias divider to a custom single-character marker', function () {
    serializationTest({
      markdown: '[[Real Page:Page Alias]]',
      expected: '<p><a href="page/real_page" class="internal broken-link">Page Alias</a></p>',
      syntaxOptions: { aliasDivider: ':' },
    })
  });

  it('handles configuring the alias divider to a custom 2-character fence', function () {
    serializationTest({
      markdown: '[[Real Page||Page Alias]]',
      expected: '<p><a href="page/real_page" class="internal broken-link">Page Alias</a></p>',
      syntaxOptions: { aliasDivider: '||' },
    })
  });
});
