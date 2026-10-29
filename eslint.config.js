// ESLint flat config, scoped to mathcore only (docs/mathcore/proposals/tooling.md). Every other path is ignored,
// so existing code is not affected. The gate runs: pnpm run lint shared/mathcore client/src/features/mathcore
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const MATHCORE = ["shared/mathcore/**/*.{js,mjs,ts,tsx}", "client/src/features/mathcore/**/*.{js,mjs,ts,tsx}"];
// Test files are excluded from tsconfig.json, so they get the untyped rule set only.
const TESTS = ["**/*.test.*", "**/__tests__/**"];

export default tseslint.config(
  // Global ignore: everything except the two mathcore trees (parent directories are un-ignored so ESLint descends).
  {
    ignores: [
      "**/*",
      "!shared/",
      "!shared/mathcore/",
      "!shared/mathcore/**",
      "!client/",
      "!client/src/",
      "!client/src/features/",
      "!client/src/features/mathcore/",
      "!client/src/features/mathcore/**",
      "**/__golden__/**",
    ],
  },
  {
    files: MATHCORE,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  // Type-aware rules for source files that tsconfig.json covers.
  {
    files: ["shared/mathcore/**/*.{ts,tsx}", "client/src/features/mathcore/**/*.{ts,tsx}"],
    ignores: TESTS,
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  // Headless engine: no rendering or UI libraries (PLAN.md, shared/mathcore pattern).
  {
    files: ["shared/mathcore/**/*.{js,mjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "shared/mathcore is headless: no React." },
            { name: "react-dom", message: "shared/mathcore is headless: no React DOM." },
            { name: "three", message: "No WebGL: rendering is CPU-only." },
          ],
          patterns: [{ group: ["react/*", "react-dom/*", "three/*"], message: "shared/mathcore is headless." }],
        },
      ],
    },
  },
  {
    files: ["client/src/features/mathcore/ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
