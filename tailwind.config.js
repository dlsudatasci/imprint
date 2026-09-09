/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

/**
 * Imprint design tokens — the single source of truth for colour, type, radius
 * and elevation.
 *
 * CSS custom properties in globals.scss are derived from these values, so a
 * change here propagates to the stylesheets that can't read the Tailwind theme
 * (the annotation tool's plain CSS, and the react-select style objects).
 *
 * See docs/design-system/README.md for the rationale behind each scale.
 */
module.exports = {
  // One glob for all of src/. The previous list named ./src/components, which
  // does not exist, and omitted ./src/hooks and ./src/util — so a class written
  // in either would have been purged with no error, the same silent-failure
  // shape as the unconfigured `container`.
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- Brand -------------------------------------------------------
        primary: {
          DEFAULT: "#004aad",
          hover: "#003d8f",   // darkens on hover; see F6
          50: "#f0f4fa",      // brand-tinted washes, replacing Tailwind blue-*
          100: "#e0e9f5",
        },

        // ---- Text ---------------------------------------------------------
        // `accent` is retained as an alias of `ink` so existing utilities keep
        // working; both resolve to the value 54 headings already ship (D5).
        ink: "#111827",
        accent: "#111827",
        body: "#4b5563",
        muted: "#6b7280",
        subtle: "#9ca3af",

        // ---- Surfaces -----------------------------------------------------
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f9fafb",
        },
        ground: "#f8f7f9",
        offwhite: "#f8f7f9", // legacy alias
        line: {
          DEFAULT: "#e5e7eb", // default border
          card: "#f3f4f6",    // card / panel edges
        },

        // ---- Semantic -----------------------------------------------------
        // Meaning, not brand. These name what the app already does: red for
        // errors and destructive actions, green for success, amber for
        // warnings. Each has a soft background and a border for banners.
        danger: {
          DEFAULT: "#dc2626",
          soft: "#fef2f2",
          border: "#fecaca",
        },
        success: {
          DEFAULT: "#16a34a",
          soft: "#f0fdf4",
          border: "#bbf7d0",
        },
        warning: {
          DEFAULT: "#d97706",
          soft: "#fffbeb",
          border: "#fde68a",
        },
        info: {
          DEFAULT: "#004aad",
          soft: "#f0f4fa",
          border: "#e0e9f5",
        },
      },

      fontFamily: {
        // Body and UI. Everything that isn't a heading.
        sans: ["var(--font-jakarta)", ...defaultTheme.fontFamily.sans],
        // Display. Headings only — see docs/design-system/README.md §2.
        display: ["var(--font-ysabeau)", ...defaultTheme.fontFamily.sans],
      },

      borderRadius: {
        control: "0.75rem", // 12px — buttons, inputs, icon buttons
        card: "1rem",       // 16px — cards, panels, wells
        modal: "1.5rem",    // 24px — modals, auth cards, hero panels
      },

      // No custom boxShadow. The blue `shadow-primary` glow was removed with the
      // button hover-lift — elevation is border-led now, and the only shadow
      // still in use is Tailwind's own shadow-2xl on true overlays. See
      // docs/design-system/DECISIONS.md D6.
    },
  },
  plugins: [],
};
