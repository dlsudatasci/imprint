import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
// import reactHooksPlugin from "eslint-plugin-react-hooks"; // CommonJS issue potential, try import * or use compat for this one if needed, but let's try direct first.
// Actually handling CJS plugins in ESM config can be tricky.
// Let's use a simpler setup first.

import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";

export default [
    {
        ignores: [".next/", "node_modules/", "out/", "build/"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
        plugins: {
            "react": reactPlugin,
            "@next/next": nextPlugin,
        },
        rules: {
            ...reactPlugin.configs.flat?.recommended?.rules ?? reactPlugin.configs.recommended.rules,
            ...nextPlugin.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    }
];
