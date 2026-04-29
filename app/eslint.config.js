import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Intentional pattern: clear state before async fetch inside effects
      'react-hooks/set-state-in-effect': 'off',
      // Valid pattern: ref.current = value during render keeps ref in sync with props
      // without causing re-renders (documented React stale-closure workaround)
      'react-hooks/refs': 'off',
      // External APIs (Spotify, weather, butterchurn) lack types — warn, don't block
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
