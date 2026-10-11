import type { Config } from "tailwindcss";
import { tokens } from "./tokens";

const c = tokens.color;
const f = tokens.font;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: c.ink950, 900: c.ink900, 850: c.ink850, 800: c.ink800,
          750: c.ink750, 700: c.ink700, 600: c.ink600,
        },
        line: { 900: c.line900, 800: c.line800, 700: c.line700 },
        text: { primary: c.textPrimary, secondary: c.textSecondary, muted: c.textMuted },
        brand: { success: c.success, danger: c.danger },
      },
      fontSize: {
        display: [tokens.fontSize.display, { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        h2: [tokens.fontSize.h2, { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        h3: tokens.fontSize.h3,
        body: tokens.fontSize.body,
        small: tokens.fontSize.small,
        tiny: tokens.fontSize.tiny,
      },
      fontFamily: {
        grotesk: f.grotesk,
        mono: f.mono,
      },
      borderRadius: {
        card: tokens.radius.card,
        panel: tokens.radius.panel,
        pill: tokens.radius.pill,
        cell: tokens.radius.cell,
        chip: tokens.radius.chip,
      },
      padding: {
        section: tokens.spacing.sectionY,
        card: tokens.spacing.cardPad,
      },
      height: {
        nav: tokens.spacing.navH,
      },
    },
  },
  plugins: [],
};
export default config;
