# Platform logos

Drop each agent's logo here. The Platforms strip (`web/components/Platforms.tsx`)
looks up, for the six agents:

    claude-code.svg   (or claude-code.png)
    codex.svg         (or codex.png)
    opencode.svg      (or opencode.png)
    pi.svg            (or pi.png)
    antigravity.svg   (or antigravity.png)
    copilot-cli.svg   (or copilot-cli.png)

- SVG preferred (scales cleanly, matches the strip's monochrome look).
- If a file is missing, the cell falls back to the name only — no broken
  images.
- Square images around 22-64px render best at the cell size used.
