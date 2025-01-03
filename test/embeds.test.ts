import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('file embeds and transclusions', function () {
  it('handles embedded images with a matching permalink', function () {
    serializationTest({
      markdown: '![[image.jpg]]',
      expected: '<p><a href="page/image.jpg" class="internal">image.jpg</a></p>',
      htmlOptions: { permalinks: ['image.jpg'] },
    })
  });

  it('handles embedded images with no matching permalink', function () {
    serializationTest({
      markdown: '![[image.jpg]]',
      expected: '<p><a href="page/image.jpg" class="internal broken-link">image.jpg</a></p>',
    })
  });
});
