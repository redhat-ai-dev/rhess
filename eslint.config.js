import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["src/ui/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@server/*", "**/server/**", "**/server"], message: "UI must not import from server code." }],
      }],
    },
  },
  {
    files: ["src/server/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@ui/*", "**/ui/**", "**/ui"], message: "Server must not import from UI code." }],
      }],
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  }
);
