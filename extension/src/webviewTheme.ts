/**
 * Shared Webview CSS: hand-written, built strictly on VS Code theme
 * variables (--vscode-*) so dark and light themes both render right.
 * Codicons are referenced inline via the extension host-provided
 * codicon.css URI; components never hardcode editor colors.
 * Transitions are 160-220ms with `prefers-reduced-motion` respected.
 */
export const WEBVIEW_CSS = /* css */ `
:root {
  --dd-transition: 160ms ease;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  margin: 0; padding: 14px 14px 28px; line-height: 1.45;
}
h3 { font-size: 1.05em; margin: 14px 0 6px; font-weight: 650; }
h4 { font-size: 0.95em; margin: 12px 0 4px; font-weight: 600; }
code { font-family: var(--vscode-editor-font-family); font-size: 0.92em;
       background: var(--vscode-textCodeBlock-background); padding: 1px 4px;
       border-radius: 3px; }
a { color: var(--vscode-textLink-foreground); }
/* ------------------------------------------------------------- cards */
.card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
  border-radius: 9px; padding: 12px 13px; margin: 9px 0;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
  transition: border-color var(--dd-transition);
}
.card:hover { border-color: var(--vscode-focusBorder); }
/* ------------------------------------------------------ status pills */
.pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: 10px; font-size: 0.82em;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}
.pill.ok    { color: #3fb95066; }
.pill.ok > span { color: var(--vscode-foreground); }
.pill.warn  { color: #d29922; }
.pill.warn > span { color: var(--vscode-foreground); }
.pill.bad   { color: var(--vscode-errorForeground); }
.pill.bad > span  { color: var(--vscode-foreground); }
/* ------------------------------------------------------- form styling */
button {
  font-family: var(--vscode-font-family); font-size: 0.92em;
  border-radius: 4px; cursor: pointer;
  transition: background-color var(--dd-transition), opacity var(--dd-transition);
}
button.primary {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  border: none; padding: 6px 14px;
}
button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
button.primary:disabled { opacity: .5; cursor: not-allowed; }
button.secondary {
  background: transparent; color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, #444));
  padding: 4px 10px;
}
button.secondary:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
button.secondary:disabled { opacity: .5; cursor: not-allowed; }
input[type=text], textarea, select {
  font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-input-foreground); background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 4px; padding: 5px 8px; width: 100%;
  transition: border-color var(--dd-transition);
}
input[type=text]:focus, textarea:focus, select:focus {
  outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder);
}
input[type=checkbox] { accent-color: var(--vscode-checkbox-background);
  border: 1px solid var(--vscode-checkbox-border, var(--vscode-panel-border, #444)); }
label { display: block; margin: 8px 0 2px; font-weight: 500; }
/* ------------------------------------------------------- checklist rows */
.check {
  display: flex; align-items: flex-start; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
}
.eyebrow { color: var(--vscode-descriptionForeground); letter-spacing: .11em;
  font-size: .72em; font-weight: 700; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between;
  margin-top: 18px; }
details.card { padding: 10px 12px; }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
details summary::before { content: "›"; display: inline-block; margin-right: 7px;
  color: var(--vscode-descriptionForeground); transition: transform var(--dd-transition); }
details[open] summary::before { transform: rotate(90deg); }
.check:last-child { border-bottom: none; }
.check .body { flex: 1; min-width: 0; }
.check .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 2px; }
.createSequentialGroup { display: none; }
/* ----------------------------------------------------------- timeline */
.timeline { position: relative; margin: 8px 0 0 8px; padding-left: 18px;
  border-left: 2px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
.phase { opacity: 0; transform: translateY(6px);
  animation: phaseIn 220ms ease forwards; margin-bottom: 10px; padding: 10px 11px;
  border-radius: 8px; }
@keyframes phaseIn { to { opacity: 1; transform: none; } }
.phase .head { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.phase .head .codicon { color: var(--vscode-charts-blue, var(--vscode-textLink-foreground)); }
.phase .muted { color: var(--vscode-descriptionForeground); font-weight: 400; }
.agent-stream { margin-top: 8px; max-height: 270px; overflow: auto; padding: 7px;
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
  border-radius: 7px; background: var(--vscode-terminal-background, var(--vscode-editor-background));
  font-family: var(--vscode-editor-font-family, monospace); font-size: .88em; }
.agent-line { display: flex; align-items: flex-start; gap: 8px; padding: 3px 2px;
  white-space: pre-wrap; overflow-wrap: anywhere; }
.agent-tag { flex: 0 0 66px; text-transform: uppercase; letter-spacing: .04em;
  font: 600 .72em var(--vscode-font-family); color: var(--vscode-descriptionForeground); }
.agent-line.assistant .agent-tag { color: var(--vscode-charts-blue, #58a6ff); }
.agent-line.tool .agent-tag, .agent-line.tool_done .agent-tag { color: var(--vscode-charts-yellow, #d29922); }
.agent-line.error .agent-tag, .agent-line.diagnostic .agent-tag { color: var(--vscode-errorForeground); }
.agent-line.assistant .agent-text { color: var(--vscode-foreground); }
.agent-line.tool .agent-text { color: var(--vscode-charts-yellow, #d29922); }
.chip {
  display: inline-block; padding: 2px 8px; margin: 2px 3px 2px 0;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
  border-radius: 10px; font-size: 0.85em;
  animation: chipIn 220ms ease;
}
@keyframes chipIn { from { opacity: 0; transform: translateX(6px); }
                    to   { opacity: 1; transform: none; } }
.confbar { height: 4px; border-radius: 2px; background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2)); margin: 3px 0; width: 140px; }
.confbar > div { height: 100%; border-radius: 2px;
  background: var(--vscode-charts-green, #3fb950);
  transition: width var(--dd-transition); }
.memcard { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
  border-radius: 5px; padding: 6px 8px; margin: 4px 0; font-size: 0.88em;
  animation: phaseIn 220ms ease forwards; }
/* ------------------------------------------------------------- footer */
.footer { display: flex; gap: 14px; flex-wrap: wrap; padding: 8px 0;
  color: var(--vscode-descriptionForeground); font-size: 0.9em;
  border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
.footer b { color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }
.notreported { color: var(--vscode-descriptionForeground); font-style: italic; }
/* ------------------------------------------------------------- misc */
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.spread { justify-content: space-between; }
.seg { display: inline-flex; border: 1px solid var(--vscode-panel-border, #444);
  border-radius: 4px; overflow: hidden; }
.seg button { border: none; padding: 4px 10px; background: transparent;
  color: var(--vscode-foreground); border-radius: 0; }
.seg button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.muted { color: var(--vscode-descriptionForeground); }
.hidden { display: none !important; }
ul.steps { margin: 4px 0 0 16px; padding: 0; }
.killswitch { display: flex; gap: 8px; align-items: center; padding: 6px 8px;
  border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  border-radius: 6px; margin-bottom: 8px; }
`;

/** Renders the codicon stylesheet <link> when the extension passes its URI. */
export function codiconLink(codiconCssUri?: string): string {
  return codiconCssUri
    ? `<link rel="stylesheet" href="${codiconCssUri}">`
    : "";
}
