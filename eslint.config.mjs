// [Input] Extension and test JavaScript sources.
// [Output] Flat ESLint rules with browser/runtime globals for CI-quality checks.
// [Pos] Repository lint gate.
export default [
  {
    ignores: ["node_modules/**"]
  },
  {
    files: ["extension/**/*.js", "tests/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        AbortController: "readonly",
        atob: "readonly",
        Blob: "readonly",
        btoa: "readonly",
        Buffer: "readonly",
        chrome: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        Element: "readonly",
        fetch: "readonly",
        HTMLElement: "readonly",
        Intl: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        Node: "readonly",
        setTimeout: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-empty": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "prefer-const": "error"
    }
  }
];
