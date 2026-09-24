import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// Import boundaries mirror frontend/boundries.py: shared never imports features/app,
// features never import app, and features reach each other only through index.ts.
const boundary = (from, message, patterns) => ({
  files: [from],
  rules: { "no-restricted-imports": ["error", { patterns: patterns.map((pattern) => ({ group: [pattern], message })) }] },
});

export default [
  { ignores: [".next/**", "node_modules/**", "src/shared/api/schema.d.ts", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  boundary("src/shared/**/*.{ts,tsx}", "shared code cannot depend on features or app", ["@/features/*", "@/app/*"]),
  boundary("src/features/**/*.{ts,tsx}", "features cannot import route composition", ["@/app/*"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
