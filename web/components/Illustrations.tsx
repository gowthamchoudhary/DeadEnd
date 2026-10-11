/** Isometric line illustrations, hand-drawn in SVG to echo the reference
 * style: dark fills, thin strokes, red/green marker chips on tiles.
 * Each fills a ~520x360 viewBox, decorative only. */

const S = { stroke: "#8b90a0", strokeWidth: 1.1, fill: "none" };

function Iso({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 520 360" className="w-full h-auto" aria-hidden>
      <defs>
        <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#565b66" />
        </pattern>
      </defs>
      {children}
    </svg>
  );
}

const c = (x: number, y: number, done: boolean, w = 96, h = 34) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={4}
      fill={done ? "#26492e" : "#5a2323"} opacity={0.9} />
    <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11"
      fontFamily="var(--font-ibm-plex-mono), monospace" fill={done ? "#7ee2a0" : "#f0a0a0"}>
      {done ? "fix" : "dead end"}
    </text>
  </g>
);

/** Why it matters: one agent burning on a bug while the next starts over. */
export function IllusLoop() {
  return (
    <Iso>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      {/* big iso platform */}
      <g>
        <polygon points="260,90 460,180 260,270 60,180" fill="#15171c" stroke="#383c46" />
        <polygon points="60,180 260,270 260,286 60,196" fill="#101116" stroke="#262a32" />
        <polygon points="460,180 260,270 260,286 460,196" fill="#0c0d10" stroke="#262a32" />
      </g>
      <g transform="translate(160 150)">
        {c(0, 0, false)}
        {c(0, 44, false)}
        {c(0, 88, true)}
      </g>
      <text x="140" y="140" textAnchor="middle" fontSize="11" fill="#b9bdc7"
        fontFamily="var(--font-ibm-plex-mono), monospace">agent 1</text>
      <g transform="translate(330 150)">
        {c(0, 0, false)}
        {c(0, 44, false)}
        {c(0, 88, true)}
      </g>
      <text x="330" y="140" textAnchor="middle" fontSize="11" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">agent 2</text>
      {/* memory loss arrow fading out */}
      <path d="M270 275l60 40" stroke="#f87171" strokeWidth="1.2" strokeDasharray="4 4" fill="none" />
      <path d="M252 275l-60 40" stroke="#4ade80" strokeWidth="1.2" fill="none" />
      <text x="340" y="330" fontSize="11" fill="#f0a0a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">lostwithout DeadEnd</text>
      <text x="128" y="330" fontSize="11" fill="#7ee2a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">kept with DeadEnd</text>
    </Iso>
  );
}

/** How it works: capture → scan → verify → handoff pipeline tile. */
export function IllusCapture() {
  return (
    <Iso>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      <g>
        <polygon points="70,140 260,60 450,140 260,220" fill="#15171c" stroke="#383c46" />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${110 + i * 120} 96)`}>
          <polygon points="0,0 34,-17 68,0 34,17" fill="#1a1c22" stroke="#32363f" />
          <circle cx="34" cy="0" r="7" fill={["#f87171", "#565b66", "#4ade80"][i]} opacity="0.9" />
        </g>
      ))}
      {/* arrows */}
      <path d="M182 118 h28 m0 0 l-7 -4 m7 4 l-7 4" {...S} />
      <path d="M302 118 h28 m0 0 l-7 -4 m7 4 l-7 4" {...S} />
      <text x="144" y="132" textAnchor="middle" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">attempts</text>
      <text x="262" y="132" textAnchor="middle" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">scans</text>
      <text x="386" y="132" textAnchor="middle" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">verified</text>
      {/* handoff */}
      <g transform="translate(240 190)">
        <polygon points="0,0 40,-20 80,0 40,20" fill="#26492e" opacity="0.85" />
        <text x="40" y="5" textAnchor="middle" fontSize="11" fill="#7ee2a0"
          fontFamily="var(--font-ibm-plex-mono), monospace">next agent</text>
      </g>
      <path d="M400 212 h-96 l0 26 m0 0 l-5 -7 m5 7 l5 -7" {...S} />
    </Iso>
  );
}

/** Under the hood row 1: trace spine with a failing step highlighted. */
export function IllusTrace() {
  return (
    <Iso>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      <path d="M60 240 L260 130 L480 220" stroke="#454a56" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 90 + i * 86;
        const y = 222 - i * 18 - (i === 4 ? 0 : 0);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <polygon points="0,0 26,-13 52,0 26,13" fill="#1a1c22" stroke="#32363f" />
            {i === 2 ? (
              <>
                <polygon points="26,-6 33,-13 40,-6 33,1" fill="#5a2323" />
                <text x="33" y="34" textAnchor="middle" fontSize="10" fill="#f0a0a0"
                  fontFamily="var(--font-ibm-plex-mono), monospace">failing step</text>
              </>
            ) : null}
          </g>
        );
      })}
      <text x="66" y="252" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">run trace</text>
      <text x="404" y="240" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">memory</text>
      <path d="M458 208 l16 6 -16 6" fill="none" stroke="#8b90a0" strokeWidth="1.1" />
    </Iso>
  );
}

/** Under the hood row 2: commit checkpoint stack (entire). */
export function IllusCheckpoint() {
  return (
    <Iso>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(150 ${230 - i * 42})`}>
          <polygon points="0,0 110,-55 220,0 110,55" fill={i === 2 ? "#1f2230" : "#15171c"}
            stroke="#32363f" />
          <text x="110" y="6" textAnchor="middle" fontSize="10.5" fill="#b9bdc7"
            fontFamily="var(--font-ibm-plex-mono), monospace">
            {["prompts", "decisions", "diff"][i]}
          </text>
        </g>
      ))}
      <g transform="translate(330 150)">
        <rect x="0" y="0" width="118" height="26" rx="4" fill="#26492e" />
        <text x="59" y="17" textAnchor="middle" fontSize="11" fill="#7ee2a0"
          fontFamily="var(--font-ibm-plex-mono), monospace">checkpoint</text>
      </g>
      <path d="M368 176 v-6 m0 -6 l-26 -12" stroke="#454a56" strokeWidth="1.1" fill="none" />
      <text x="352" y="230" fontSize="10.5" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">
        fix ↔ reasoning
      </text>
    </Iso>
  );
}

/** Under the hood row 3: cost curve vs saving curve (cfo.ai). */
export function IllusCost() {
  return (
    <Iso>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      <g>
        <polygon points="70,250 260,160 460,250 260,340" fill="#15171c" stroke="#32363f" opacity="0.6" />
      </g>
      {/* rising cost line */}
      <polyline points="100,270 170,238 240,210 330,206 420,232" fill="none" stroke="#f87171" strokeWidth="1.6" />
      <polyline points="100,204 190,196 280,188 420,186" fill="none" stroke="#4ade80" strokeWidth="1.6"
        strokeDasharray="5 4" />
      <text x="92" y="292" fontSize="10.5" fill="#f0a0a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">cost per fix</text>
      <text x="92" y="192" fontSize="10.5" fill="#7ee2a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">saving from reuse</text>
      <text x="380" y="122" fontSize="11" fill="#b9bdc7"
        fontFamily="var(--font-ibm-plex-mono), monospace">plan: price · margin · runway</text>
      <path d="M356 128 h-58 m0 0 l8 -5 m-8 5 l8 5" stroke="#b9bdc7" strokeWidth="1.1" fill="none" />
    </Iso>
  );
}

/** Private vs global: two vaults sharing a narrow gated pipe. */
export function IllusContext({ small = false }: { small?: boolean }) {
  const vb = small ? "0 90 520 220" : "0 0 520 360";
  return (
    <svg viewBox={vb} className="w-full h-auto" aria-hidden>
      <defs>
        <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#565b66" />
        </pattern>
      </defs>
      <rect width="520" height="360" fill="url(#dots)" opacity="0.4" />
      {/* private vault */}
      <g transform="translate(90 140)">
        <rect width="120" height="90" rx="8" fill="#15171c" stroke="#32363f" />
        <rect x="14" y="14" width="40" height="10" rx="3" fill="#32363f" />
        <rect x="14" y="34" width="70" height="10" rx="3" fill="#32363f" />
        <rect x="14" y="54" width="52" height="10" rx="3" fill="#32363f" />
      </g>
      <text x="150" y="120" textAnchor="middle" fontSize="11" fill="#b9bdc7"
        fontFamily="var(--font-ibm-plex-mono), monospace">private</text>
      {/* global vault */}
      <g transform="translate(330 140)">
        <rect width="120" height="90" rx="8" fill="#15171c" stroke="#32363f" />
        <rect x="14" y="14" width="40" height="10" rx="3" fill="#26492e" />
        <rect x="14" y="34" width="70" height="10" rx="3" fill="#26492e" />
        <rect x="14" y="54" width="52" height="10" rx="3" fill="#26492e" />
      </g>
      <text x="390" y="120" textAnchor="middle" fontSize="11" fill="#b9bdc7"
        fontFamily="var(--font-ibm-plex-mono), monospace">global</text>
      {/* gated pipe */}
      <path d="M214 185 h72 m0 0 l-8 -4 m8 4 l-8 4" stroke="#454a56" strokeWidth="1.4" fill="none" />
      <g transform="translate(238 160)">
        <rect width="30" height="18" rx="4" fill="#20232a" stroke="#32363f" />
        <circle cx="15" cy="9" r="3" fill="#e2b487" />
      </g>
      <text x="253" y="128" textAnchor="middle" fontSize="10" fill="#8b90a0"
        fontFamily="var(--font-ibm-plex-mono), monospace">redact + approve</text>
    </Iso>
  );
}
