import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  FileReader: 'readonly',
  fetch: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  process: 'readonly',
  navigator: 'readonly',
  HTMLElement: 'readonly',
  Event: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
};

const vitestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
  global: 'writable',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'build-standalone.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', '**/test/**/*.{js,jsx}', '**/setupTests.{js,jsx}'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...vitestGlobals,
      },
    },
  },
];

