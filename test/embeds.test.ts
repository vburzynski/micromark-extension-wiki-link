import { describe, it } from 'mocha';
import { serializationTest } from './support/serializationTest.js';

describe('file embeds and transclusions', function () {
  describe('note transclusion', function () {
    it('handles transclude content', function () {
      serializationTest({
        markdown: '![[title]]',
        expected: '<p><blockquote class="embed" data-url="page/title"><a href="page/title">Click to open: title</a></blockquote></p>',
      })
    });

    it('handles a path with an anchor', function () {
      serializationTest({
        markdown: '![[title#heading]]',
        expected: '<p><blockquote class="embed" data-url="page/title#heading" data-anchor="heading"><a href="page/title#heading">Click to open: title</a></blockquote></p>',
      })
    });

    it('handles a path with a block ID reference', function () {
      serializationTest({
        markdown: '![[title#^123456]]',
        expected: '<p><blockquote class="embed" data-url="page/title" data-block-id="123456"><a href="page/title">Click to open: title</a></blockquote></p>',
      })
    });
  });

  describe('image files handling', function () {
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

    it('handles embedding an image with a specified width', function () {
      serializationTest({
        markdown: '![[image.jpg|100]]',
        expected: '<p><img src="page/image.jpg" width="100" /></p>',
      })
    })

    it('handles embedding an image with a specified width and height dimensions', function () {
      serializationTest({
        markdown: '![[image.jpg|100x200]]',
        expected: '<p><img src="page/image.jpg" height="100" width="200" /></p>',
      })
    })
  });

  describe('audio file handling', function () {
    it('handles embedded audio files', function () {
      serializationTest({
        markdown: '![[file.mp3]]',
        expected: '<p><audio src="page/file.mp3" controls></audio></p>',
      })
    });
  });

  describe('video file handling', function () {
    it('handles embedded video files', function () {
      serializationTest({
        markdown: '![[file.mov]]',
        expected: '<p><video src="page/file.mov" controls></video></p>',
      })
    });
  });

  describe('PDF file handling', function () {
    it('handles embedded pdf files', function () {
      serializationTest({
        markdown: '![[file.pdf]]',
        expected: '<p><embed src="page/file.pdf" type="application/pdf"></embed></p>',
      })
    });

    it('handles embedding a PDF on a specific page', function () {
      serializationTest({
        markdown: '![[file.pdf#page=3]]',
        expected: '<p><embed src="page/file.pdf#page=3" type="application/pdf"></embed></p>',
      });
    });

    it('handles embedding a PDF with a specific viewport height set', function () {
      serializationTest({
        markdown: '![[file.pdf#height=450]]',
        expected: '<p><embed src="page/file.pdf" height="450" type="application/pdf"></embed></p>',
      });
    });
  });
});
