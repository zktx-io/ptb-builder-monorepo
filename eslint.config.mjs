import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import typescriptEslintParser from '@typescript-eslint/parser';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['**/dist', '**/node_modules'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: typescriptEslintParser,
      globals: {
        JSX: 'readonly',
      },
    },
    plugins: {
      react: eslintPluginReact,
      '@typescript-eslint': typescriptEslintPlugin,
      prettier: eslintPluginPrettier,
      import: eslintPluginImport,
      'react-hooks': eslintPluginReactHooks,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-console': 'warn',
      'comma-dangle': ['error', 'always-multiline'],
      'react/prop-types': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=null]',
          message: 'Do not use null. Use undefined instead.',
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'import/order': [
        'error',
        {
          groups: [
            ['builtin', 'external'],
            ['internal'],
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['packages/ptb-model/src/utils.ts'],
    rules: {
      // Sui SDK 2.16.2 models MakeMoveVec.type as nullable(string()).
      // Keep the literal null in one model helper instead of hiding it.
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['packages/ptb-builder/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../**/ptb-model',
                '../**/ptb-model/**',
                'packages/ptb-model/**',
                '@zktx.io/ptb-model/**',
              ],
              message:
                'Import @zktx.io/ptb-model through the package root only; do not cross package boundaries or import model internals.',
            },
          ],
        },
      ],
    },
  },
];
