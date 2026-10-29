import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri', 'gme-mod', 'tools', 'scripts', 'examples'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // UI text must go through t() (src/locales/en.json). Only JSX text is checked:
  // schema/data tables, generated story text and exported values stay English.
  {
    ...i18next.configs['flat/recommended'],
    files: ['src/components/**/*.tsx', 'src/App.tsx'],
    ignores: ['src/components/ui/**'],
    rules: { 'i18next/no-literal-string': ['warn', { mode: 'jsx-text-only' }] },
  },
)
