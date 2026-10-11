/**
 * DeadEnd design tokens — every color, font size, weight, radius, spacing
 * and border value sampled from the reference screenshot. Tweak here.
 * Imported by both globals.css (CSS custom props) and tailwind.config.ts
 * (theme extension).
 */
export const tokens = {
  color: {
    // gradient hero stops
    gLavender: "#c9b7e0",
    gLavenderSoft: "#d8c9ea",
    gBlue: "#7c96e8",
    gBlueDeep: "#4f6ad4",
    gPeach: "#f0b3a4",
    gPeachWarm: "#f6c9ae",
    gCream: "#f3e6d8",
    gAmber: "#e2b487",
    // dark surface scale
    ink950: "#0c0d10",
    ink900: "#111216",
    ink850: "#15171c",
    ink800: "#1a1c22",
    ink750: "#20232a",
    ink700: "#262a32",
    ink600: "#32363f",
    line900: "#2a2d35",
    line800: "#383c46",
    line700: "#454a56",
    textPrimary: "#f2f3f5",
    textSecondary: "#b9bdc7",
    textMuted: "#7d8290",
    textOnLight: "#17181c",
    success: "#4ade80",
    danger: "#f87171",
    redCard: "#5a2323",
    greenCard: "#26492e",
    pillText: "#17181c",
  },
  fontSize: {
    display: "56px",      // hero headline
    h2: "34px",           // section headings
    h3: "22px",           // card titles
    body: "15px",
    small: "13px",
    tiny: "11px",
  },
  fontWeight: {
    headline: 700,
    heading: 700,
    body: 400,
    label: 500,
  },
  radius: {
    pill: "999px",
    card: "14px",
    panel: "10px",
    cell: "6px",
    chip: "5px",
  },
  spacing: {
    sectionY: "88px",
    cardPad: "32px",
    navH: "64px",
    heroPadTop: "96px",
    heroPadBottom: "0px", // panel overlaps gradient via negative margin
  },
  border: {
    width1: "1px",
    width2: "2px",
  },
  hatch: {
    size: "14px",
    opacity: 0.22,
  },
  grain: {
    opacity: 0.55,
    turbulenceBaseFrequency: "0.9",
  },
  font: {
    grotesk: "var(--font-space-grotesk), system-ui, sans-serif",
    mono: "var(--font-ibm-plex-mono), ui-monospace, monospace",
    body: "var(--font-space-grotesk), system-ui, sans-serif",
  },
} as const;
