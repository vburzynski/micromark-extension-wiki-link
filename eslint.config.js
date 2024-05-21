import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import mochaPlugin from 'eslint-plugin-mocha';

export default [
  {
    ignores: ['dist/*'],
  },
  eslint.configs.recommended,
  mochaPlugin.configs.flat.recommended,
  eslintConfigPrettier
];
