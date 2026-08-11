import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "prefer-const": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    files: [
      "features/**/client/**/*.{ts,tsx}",
      "features/**/components/**/*.{ts,tsx}",
      "features/**/hooks/**/*.{ts,tsx}",
      "features/**/state/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "context/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "@/lib/db/**"],
              message: "Client and UI modules must not depend on database internals.",
            },
            {
              group: ["@/features/*/server", "@/features/*/server/**"],
              message: "Client and UI modules must use a public client API, not server internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["mobile/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "@/lib/db/**", "@/features/*/server", "@/features/*/server/**"],
              message: "The mobile bundle may only import browser-safe product code.",
            },
            {
              // Transitional list. Remove an exception whenever its screen is
              // extracted from the Next route tree into a product entrypoint.
              group: ["@/app/**"],
              message: "Mobile must consume a product screen entrypoint rather than a Next route.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/**/*.{ts,tsx}"],
    ignores: [
      "**/__tests__/**",
      // Transitional reporting-query inversions. Remove an entry when the
      // corresponding dependency moves behind a neutral contract.
      "lib/db/queries/school-usage-stats.ts",
      "lib/db/queries/usage-stats.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/features/*/components",
                "@/features/*/components/**",
                "@/features/*/hooks",
                "@/features/*/hooks/**",
                "@/features/*/server",
                "@/features/*/server/**",
              ],
              message: "Shared foundations must not depend on feature UI, workflows, or server internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/**",
                "next",
                "next/**",
                "@capacitor/**",
                "drizzle-orm",
                "drizzle-orm/**",
                "@/app/**",
                "@/features/**",
                "@/lib/db",
                "@/lib/db/**",
              ],
              message: "Domain code must remain framework, transport, and persistence independent.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".claude/**",
    ".worktrees/**",
    ".next/**",
    ".next-dev/**",
    "out/**",
    "build/**",
    "mobile/dist/**",
    "mobile/ios/App/App/public/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
