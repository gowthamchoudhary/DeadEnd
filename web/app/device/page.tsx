"use client";

/** /device?code=XXXX — device-flow approval (session required).
 * The extension hits GET /auth/device/approve?user_code=… via the proxy.
 * Note: the backend has approve only (extension flow has its own deny via
 * timeout) — Deny here simply closes the flow on our side. */
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMe, api } from "@/lib/useApi";
import { DeadEndMark } from "@/components/Nav";

/** Next 14 static generation calls useSearchParams in the page component
 * during prerender — without a Suspense boundary above it, `next build`
 * (and therefore Vercel) fails. The hook lives in DeviceFlow, which is
 * mounted *inside* the boundary. */
export default function DevicePage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-small text-text-muted">loading…</p>
        </Shell>
      }
    >
      <DeviceFlow />
    </Suspense>
  );
}

function DeviceFlow() {
  const sp = useSearchParams();
  const code = sp.get("code") ?? "";
  const { me, loading, unauthorized } = useMe({ redirectOn401: "/login" });
  const [teamId, setTeamId] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const team = teamId || me?.teams[0]?.team_id || "";

  async function approve() {
    if (!code || !me) return;
    setBusy(true);
    try {
      const r = await api.deviceApprove(code, team || undefined);
      setResult(r.status === "approved" ? "approved" : r.status);
    } catch (ex) {
      setResult(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Shell><p className="text-small text-text-muted">checking sign-in…</p></Shell>;
  }
  if (unauthorized || !me) {
    return (
      <Shell>
        <p className="text-small text-text-secondary mb-4">
          Sign in with GitHub to approve this device.
        </p>
        <a href="/api/auth/github" className="pill-fill px-5 py-2 text-small font-medium">Sign in</a>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="text-tiny uppercase tracking-widest text-text-muted mb-2">device code</div>
      <div className="font-mono text-2xl tracking-[0.35em] mb-4">{code || "—"}</div>
      {!result && (
        <>
          <p className="text-small text-text-secondary mb-4">
            Approving creates an API token for this device, scoped to your
            selected team. It is shown once to the device.
          </p>
          {me.teams.length > 1 && (
            <select value={team} onChange={(e) => setTeamId(e.target.value)}
              className="w-full bg-ink-800 border border-line-800 rounded-chip text-small p-2 mb-4">
              {me.teams.map((t) => (
                <option key={t.team_id} value={t.team_id}>team {t.team_id} ({t.role})</option>
              ))}
            </select>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={approve} disabled={busy || !code}
              className="pill-fill px-5 py-2 text-small font-medium disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => setResult("denied")}
              className="pill-outline px-5 py-2 text-small">Deny</button>
          </div>
        </>
      )}
      {result === "approved" && (
        <div className="space-y-3 text-left">
          <p className="text-small text-brand-success">Approved.</p>
          <p className="text-small text-text-secondary">
            Return to VS Code — it should show your name in the status bar
            within a few seconds. The token is delivered to the extension
            exactly once, then kept in its SecretStorage.
          </p>
          <a href="/docs/getting-started"
            className="pill-outline inline-block px-4 py-1.5 text-small">
            Next: the getting-started guide →
          </a>
        </div>
      )}
      {result === "denied" && (
        <p className="text-small text-brand-danger">Denied — nothing was shared.</p>
      )}
      {result && result !== "approved" && result !== "denied" && (
        <p className="text-small text-brand-danger">Backend said: {result}</p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm border border-line-800 rounded-card bg-ink-900 p-8 text-center">
        <div className="flex justify-center mb-4"><DeadEndMark size={24} /></div>
        {children}
      </div>
    </main>
  );
}
