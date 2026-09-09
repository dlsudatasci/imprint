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
    },

    /**
     * Design system guardrails.
     *
     * These exist because an unenforced convention doesn't survive: the app
     * previously had a `baseButton` string copy-pasted into three files that
     * had already drifted apart by the third copy. See
     * docs/design-system/AUDIT.md F3.
     */
    {
        files: ["src/**/*.{js,jsx,ts,tsx}"],
        ignores: [
            // Three.js material colours and a categorical map palette. These
            // are scene and data colours, not UI chrome, and deliberately sit
            // outside the token system.
            "src/ui/InteractiveObstructions.jsx",
            "src/features/home/CityMap.jsx",
            // The token modules are where the literal values are allowed to live.
            "src/ui/tokens.ts",
        ],
        rules: {
            "no-restricted-syntax": [
                "warn",
                {
                    selector: "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
                    message:
                        "Hard-coded hex colour. Use a design token (bg-primary, text-ink, border-line...) — see docs/design-system/README.md §1.",
                },
                {
                    selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
                    message:
                        "Hard-coded hex colour. Use a design token — see docs/design-system/README.md §1.",
                },
            ],
        },
    },

    /**
     * Page width and side padding belong to <Container>, not to screens.
     *
     * Tailwind's `container` is what caused the misalignment this rule exists to
     * prevent: unconfigured it uses *stepped* max-widths, so the shell snaps
     * between breakpoints instead of resizing, and any element not using it
     * drifts out of alignment below 1280. See docs/design-system/README.md §3.
     */
    {
        files: ["src/pages/**/*.{js,jsx,ts,tsx}", "src/features/**/*.{js,jsx,ts,tsx}"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)container(\\s|$)/]",
                    message:
                        "Tailwind's `container` snaps between breakpoints and misaligns with anything that doesn't use it. Use <Container> from @/ui — see docs/design-system/README.md §3.",
                },
                {
                    selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)container(\\s|$)/]",
                    message:
                        "Tailwind's `container` snaps between breakpoints. Use <Container> from @/ui.",
                },
            ],
        },
    },

    /**
     * Raw <button> belongs in the component library, not in screens. Every
     * screen-level button should come from @/ui so there is one place to
     * change how a button looks.
     */
    {
        files: ["src/pages/**/*.{js,jsx,ts,tsx}", "src/features/**/*.{js,jsx,ts,tsx}"],
        rules: {
            "react/forbid-elements": [
                "warn",
                {
                    forbid: [
                        {
                            element: "button",
                            message:
                                "Use <Button> or <IconButton> from @/ui instead of a raw <button>. If no variant fits, add one to the library — see docs/design-system/README.md §7.",
                        },
                    ],
                },
            ],
        },
    },
];
