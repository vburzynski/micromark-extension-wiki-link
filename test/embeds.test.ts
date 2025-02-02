import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('file embeds and transclusions', function () {
  it('handles embedded images with a matching permalink', function () {
    serializationTest({
      markdown: '![[image.jpg]]',
      expected: '<p><img src="page/image.jpg" /></p>',
      htmlOptions: { permalinks: ['image.jpg'] },
    })
  });

  it('handles embedded images with no matching permalink', function () {
    serializationTest({
      markdown: '![[image.jpg]]',
      expected: '<p><img src="page/image.jpg" /></p>',
    })
  });

  it('handles embedded audio files', function () {
    serializationTest({
      markdown: '![[file.mp3]]',
      expected: '<p><audio src="page/file.mp3" controls></audio></p>',
    })
  });

  it('handles embedded video files', function () {
    serializationTest({
      markdown: '![[file.mov]]',
      expected: '<p><video src="page/file.mov" controls></video></p>',
    })
  });

  it('handles embedded pdf files', function () {
    serializationTest({
      markdown: '![[file.pdf]]',
      expected: '<p><embed src="page/file.pdf" type="application/pdf"></embed></p>',
    })
  });

  it('handles transclude content', function () {
    serializationTest({
      markdown: '![[title#heading]]',
      expected: '<p><blockquote class="embed" data-url="page/title#heading" data-anchor="heading"><a href="page/title#heading">Click to open: {wikiLink.destination}</a></blockquote></p>',
    })
  });
});
