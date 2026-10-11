"use client";

/** Shared dashboard UI kit — same tokens as the landing page (tokens.ts →
 * tailwind theme): bordered cards, pill buttons, mono labels. Includes the
 * loading skeletons, empty states and the error boundary every page uses.
 * No number is ever invented here: `null` renders as "no data yet". */
import { Component, type ReactNode } from "react";

/* ------------------------------------------------------------- format */
export const fmt = {
  num: (v: number | null | undefined) =>
    v === null || v === undefined ? null : v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  dec: (v: number | null | undefined, d = 2) =>
    v === null || v === undefined ? null : v.toLocaleString(undefined, { maximumFractionDigits: d }),
  pct: (v: number | null | undefined) =>
    v === null || v === undefined ? null : `${Math.round(v * 100)}%`,
  dur: (s: number | null | undefined) => {
    if (s === null || s === undefined) return null;
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}m ${Math.round(s % 60)}s`;
    return `${Math.round(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  },
  bytes: (tokens: number | null | undefined) =>
    tokens === null || tokens === undefined ? null
      : tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M`
      : tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}k`
      : String(tokens),
  dt: (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  },
  ago: (iso: string | null | undefined) => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return null;
    const m = Math.round(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  },
};

/* --------------------------------------------------------------- shell */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-line-800 rounded-card bg-ink-900 ${className}`}>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, actions }: {
  title: string; sub?: string; actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-h3 font-bold">{title}</h1>
        {sub && <p className="text-small text-text-muted mt-1 max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-small font-medium text-text-secondary">{children}</h2>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------ controls */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "fill" | "outline" | "danger";
};
export function Btn({ variant = "outline", className = "", ...rest }: BtnProps) {
  const base = "rounded-full px-4 py-1.5 text-small transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const style = variant === "fill"
    ? "pill-fill font-medium"
    : variant === "danger"
    ? "border border-brand-danger/50 text-brand-danger hover:bg-brand-danger/10"
    : "border border-line-800 text-text-primary hover:border-line-700 hover:bg-ink-850";
  return <button className={`${base} ${style} ${className}`} {...rest} />;
}

export function Field({ label, children, hint }: {
  label: string; children: ReactNode; hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-tiny uppercase tracking-widest text-text-muted mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-tiny text-text-muted mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full bg-ink-850 border border-line-800 rounded-chip px-3 py-2 text-small " +
  "text-text-primary placeholder:text-text-muted focus:border-line-700";

export function Select({ className = "", ...rest }:
  React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`bg-ink-850 border border-line-800 rounded-chip px-2.5 py-1.5 text-small text-text-secondary ${className}`}
      {...rest}
    />
  );
}

/* --------------------------------------------------------------- states */
export function Badge({ children, tone = "muted" }: {
  children: ReactNode; tone?: "muted" | "good" | "bad" | "warn";
}) {
  const map = {
    muted: "border-line-800 text-text-muted",
    good: "border-brand-success/40 text-brand-success",
    bad: "border-brand-danger/40 text-brand-danger",
    warn: "border-amber-400/40 text-amber-300",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 border rounded-chip px-1.5 py-0.5 text-tiny ${map[tone]}`}>
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const c = status === "success" ? "bg-brand-success"
    : status === "running" ? "bg-amber-400 animate-pulse"
    : status === "failure" ? "bg-brand-danger" : "bg-line-700";
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c}`} aria-hidden />;
}

/** Empty state: honest copy + a call to action. Never faked data. */
export function Empty({ title, body, cta }: {
  title: string; body: string; cta?: { label: string; href: string };
}) {
  return (
    <div className="border border-dashed border-line-800 rounded-card bg-ink-900/40 px-6 py-10 text-center">
      <div className="text-body font-medium mb-1.5">{title}</div>
      <p className="text-small text-text-muted max-w-md mx-auto mb-4">{body}</p>
      {cta && (
        <a href={cta.href} className="pill-fill inline-block px-4 py-1.5 text-small font-medium">
          {cta.label}
        </a>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-chip bg-ink-800 ${className}`} aria-hidden />;
}

export function SkeletonRows({ n = 4, h = "h-10" }: { n?: number; h?: string }) {
  return (
    <div className="border border-line-800 rounded-card bg-ink-900 divide-y divide-line-900">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="px-4 py-3"><Skeleton className={`${h} w-full`} /></div>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { error: Error | undefined }) {
  if (!error) return null;
  return (
    <div role="alert" className="border border-brand-danger/40 bg-brand-danger/5 rounded-card px-4 py-3 text-small text-brand-danger">
      {error.message || "something went wrong"}
    </div>
  );
}

/* ------------------------------------------------------- error boundary */
interface EBState { error: Error | null }
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="border border-brand-danger/40 rounded-card bg-ink-900 px-5 py-6">
          <div className="text-body font-medium mb-1">
            {this.props.label ? `${this.props.label} failed to render` : "This section failed to render"}
          </div>
          <p className="text-small text-text-muted mb-3 font-mono break-all">
            {this.state.error.message}
          </p>
          <button onClick={() => this.setState({ error: null })}
            className="pill-outline px-4 py-1.5 text-small">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------ display */
/** Confidence with its observation count — alpha/(alpha+beta) base, and the
 * backend's read-time score when the detail endpoint supplies it. */
export function Confidence({ alpha, beta, score, observations }: {
  alpha: number; beta: number; score?: number; observations?: number;
}) {
  const base = alpha + beta > 0 ? alpha / (alpha + beta) : null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-small text-text-primary">
        {score !== undefined ? fmt.dec(score, 3) : fmt.dec(base, 2) ?? "—"}
      </span>
      {observations !== undefined && (
        <span className="text-tiny text-text-muted">
          {observations} {observations === 1 ? "observation" : "observations"}
        </span>
      )}
    </span>
  );
}

/** Tiny horizontal bar chart. Values are whatever the caller fetched. */
export function Bars({ rows }: { rows: { label: string; value: number | null; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-tiny text-text-muted truncate">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full bg-line-700" style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right font-mono text-tiny text-text-secondary">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

/** Mono block for recipes / payloads — never truncated silently. */
export function Code({ children, className = "" }: { children: string; className?: string }) {
  return (
    <pre className={`font-mono text-tiny text-text-secondary bg-ink-850 border border-line-900 rounded-cell p-3 whitespace-pre-wrap break-words ${className}`}>
      {children || "—"}
    </pre>
  );
}
