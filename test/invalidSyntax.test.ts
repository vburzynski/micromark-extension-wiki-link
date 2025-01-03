import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('open wiki links that are not closed', function () {
  it('ignores open wiki links', function () {
    serializationTest({
      markdown: 't[[\nt',
      expected: '<p>t[[\nt</p>',
    })
  });

  it('ignores open wiki links at end of file', function () {
    serializationTest({
      markdown: 't [[',
      expected: '<p>t [[</p>',
    })
  });

  it('ignores open wiki links with partial data', function () {
    serializationTest({
      markdown: 't [[tt\nt',
      expected: '<p>t [[tt\nt</p>',
    })
  });

  it('ignores open wiki links with partial alias divider', function () {
    serializationTest({
      markdown: '[[t|\nt',
      expected: '<p>[[t|\nt</p>',
      syntaxOptions: { aliasDivider: '||' },
    })
  });

  it('ignores open wiki links with partial alias', function () {
    serializationTest({
      markdown: '[[t|\nt',
      expected: '<p>[[t|\nt</p>',
    })
  });
});
