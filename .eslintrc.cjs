module.exports = {
  extends: ['airbnb-base', 'prettier', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  ignorePatterns: ['dist', 'build', '.attic'],
  root: true,
  env: {
    node: true,
    browser: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
    'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        ts: 'never',
        js: 'ignorePackages',
        mjs: 'ignorePackages',
        jsx: 'never',
        tsx: 'never',
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      { devDependencies: ['**/*.test.*', '**/*.spec.*', 'build.js'] },
    ],
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'internal',
          'external',
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        pathGroups: [{ pattern: '@ev/**', group: 'internal' }],
        distinctGroup: true,
        alphabetize: { order: 'asc', caseInsensitive: false },
      },
    ],
    'import/prefer-default-export': 'off',
    'linebreak-style': ['error', 'unix'],
    'lines-between-class-members': [
      'error',
      'always',
      { exceptAfterSingleLine: true },
    ],
    'no-param-reassign': ['error', { props: false }],
    'no-use-before-define': ['error', { functions: false }],

    // airbnb-base predates ES2015 iteration and TypeScript. Keep the bans that
    // still matter (for-in, labels, with) and drop the one on for-of, which is
    // the natural way to walk a Map or a Set.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ForInStatement',
        message:
          'Use Object.{keys,values,entries} and iterate over the result instead.',
      },
      { selector: 'LabeledStatement', message: 'Labels are a form of GOTO.' },
      { selector: 'WithStatement', message: '`with` is disallowed.' },
    ],
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'no-continue': 'off',

    // `void promise` is the conventional way to say "deliberately not awaited",
    // which is exactly what @typescript-eslint/no-floating-promises asks for.
    'no-void': ['error', { allowAsStatement: true }],

    // The base rule flags TypeScript parameter properties as useless.
    'no-useless-constructor': 'off',
    '@typescript-eslint/no-useless-constructor': 'error',
  },
  settings: {
    // Apply special parsing for TypeScript files
    'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'] },
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.browser.json', './tsconfig.node.json'],
      },
      node: { extensions: ['.mjs', '.js', '.json', '.ts', '.d.ts'] },
    },
    'import/extensions': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.d.ts'],
    // Resolve type definition packages
    'import/external-module-folders': ['node_modules', 'node_modules/@types'],
  },
  overrides: [
    { files: ['*.ts', '*.tsx'], rules: { 'import/no-unresolved': 'off' } },
    {
      files: ['*.js', '*.jsx'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-unresolved': 'off',
      },
    },
    {
      // A service worker has its own global scope: `self`, `clients`, no DOM.
      files: ['src/assets/sw.js'],
      env: { worker: true, serviceworker: true, browser: false, node: false },
      rules: {
        'no-restricted-globals': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['*.spec.*', '*.test.*'],
      extends: ['plugin:mocha/recommended'],
      plugins: ['mocha'],
      rules: {
        'import/no-extraneous-dependencies': ['off'],
        'mocha/no-mocha-arrows': ['off'],
        // Several suites per file is fine, and `this.timeout()` requires a
        // non-arrow function, which trips func-names.
        'mocha/max-top-level-suites': ['off'],
        'mocha/no-setup-in-describe': ['off'],
        'func-names': ['off'],
        'no-unused-expressions': ['off'],
      },
    },
  ],
};
