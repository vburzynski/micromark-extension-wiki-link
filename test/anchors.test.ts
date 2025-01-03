import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('internal link with anchor', function () {
  it('handles targeting of an anchor on the current page', function () {
    serializationTest({
      markdown: '[[#anchor]]',
      expected: '<p><a href="#anchor" class="internal">anchor</a></p>',
    });
  });

  it('handles targeting of an anchor on another page', function () {
    serializationTest({
      markdown: '[[title#anchor]]',
      expected: '<p><a href="page/title#anchor" class="internal">anchor</a></p>',
      htmlOptions: { permalinks: ['title'] },
    });
  });

  it.skip('handles targeting a Block ID on the same page', function () {
    serializationTest({
      markdown: '[[#^id]]',
      expected: '<p><a href="#id" class="internal">anchor</a></p>',
    });
  });

  it.skip('handles targeting a Block ID on a different page', function () {
    serializationTest({
      markdown: '[[title#^id]]',
      expected: '<p><a href="page/title#id" class="internal">anchor</a></p>',
      htmlOptions: { permalinks: ['title'] },
    });
  });

  it.skip('handles nested anchors');
});
