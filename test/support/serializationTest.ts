import { expect } from 'chai';
import { micromark } from 'micromark';

import { internalLinkHtml, internalLinkSyntax, WikiLinkSyntaxOptions, WikiLinkHtmlOptions } from '../../src/index.js';

interface SerializationTestConfig {
  markdown: string;
  expected: string;
  syntaxOptions?: WikiLinkSyntaxOptions;
  htmlOptions?: WikiLinkHtmlOptions;
};

const defaultSerializationTestConfiguration: SerializationTestConfig = {
  markdown: '',
  expected: '',
  syntaxOptions: {},
  htmlOptions: {},
}

export function serializationTest(config: SerializationTestConfig) {
  config = { ...defaultSerializationTestConfiguration, ...config };

  let actual = micromark(config.markdown, {
    extensions: [internalLinkSyntax(config.syntaxOptions)],
    htmlExtensions: [internalLinkHtml(config.htmlOptions)],
  });

  expect(actual).to.equal(config.expected);
}
