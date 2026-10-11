/**
 * Typed client for the DeadEnd backend as spoken by /web: cookies
 * (credentials: "include") via the /api proxy (no Bearer here — this is
 * the dashboard, not the runner), 401 → typed UnauthorizedError.
 *
 * Every shape below is verified against deadend_backend/app/routers
 * (regenerated openapi.json at deadend_backend/openapi.json). Nothing is
 * invented client-side: if the backend returns null, the UI says "no data
 * yet" rather than filling in a number.
 */
export const BACKEND_PROXY = "/api";

export class UnauthorizedError extends Error {}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_PROXY}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new UnauthorizedError("not signed in");
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch { /* html error pages */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

const get = <T,>(path: string) => req<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = <T,>(path: string, body: unknown) =>
  req<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T,>(path: string) => req<T>(path, { method: "DELETE" });

/* ---------------------------------------------------------------- types */
export interface MeResp {
  id: string; login: string; name?: string | null; avatar_url?: string | null;
  teams: { team_id: string; role: string }[];
}
/** GET /teams — my teams WITH names (me/overview only carries ids). */
export interface MyTeam {
  team_id: string; name: string; role: string; members: number; created_at: string;
}
export interface InviteItem {
  invite_id: string; team_id: string; team_name: string; role: string; created_at: string;
}
/** GET /teams/{id}/invites — invites sent TO a team (owner/admin). */
export interface TeamInviteItem {
  invite_id: string; github_login: string; role: string;
  invited_by: string | null; created_at: string;
}
export interface MemberItem { user_id: string; login: string; role: string }

export interface Overview {
  teams: { team_id: string; role: string }[];
  tokens?: boolean;
  entries?: { private: number; global_reused: number; verified: number; source?: string[] } | null;
  runs?: {
    total: number; success_rate: number | null; total_tokens: number | null;
    time_saved_seconds: number | null; note?: string;
  } | null;
  repeated_failures?: { signature_hash: string; count: number; title: string }[];
  recent_runs?: { run_id: string; task: string; agent: string; status: string; started_at: string }[];
}

export interface EntryView {
  id: string; scope: "private" | "global"; team_id: string | null;
  title: string | null; signature_hash: string; signature_normalized: string;
  redacted_error_text: string; env_fingerprint: Record<string, unknown>;
  attempts: Attempt[]; fix: Fix | null; constraints: unknown[];
  seeded: boolean; verified: boolean;
  neatlogs_trace_id: string | null; entire_checkpoint_id: string | null;
  alpha: number; beta: number; project_id: string | null;
  last_reuse_at: string | null; created_at: string;
  observations?: number; reuse_success?: number;
}
export interface Attempt {
  id?: string; parent_attempt_id?: string | null; error?: string;
  reason?: string; outcome?: string; summary?: string;
  [k: string]: unknown;
}
export interface Fix {
  recipe?: string; summary?: string; verified?: boolean;
  environment?: Record<string, unknown>; provenance?: Record<string, unknown>;
  [k: string]: unknown;
}
/** GET /entries/{id} — list view + reuse events + canonical confidence. */
export interface EntryDetail extends EntryView {
  reuse_events: { id: string; kind: string; outcome: string; at: string }[];
  confidence: {
    score: number; alpha: number; beta: number; observations: number;
    env_match: number; recency_decay: number; verified: boolean;
  };
}

export interface RunView {
  run_id: string; team_id: string; task: string; agent: string;
  agent_version: string | null; model: string | null;
  tokens_in: number | null; tokens_out: number | null; duration: number | null;
  project_id: string | null; status: string; context_used: boolean;
  context_pack: Record<string, unknown> | null;
  started_at: string; finished_at: string | null;
}
export interface RunDetail extends RunView {
  events: { seq: number; phase: string; payload: Record<string, unknown>; at: string }[];
}
export interface AgentAgg {
  runs: number; success_rate: number | null; avg_attempts: number | null;
  avg_tokens: number | null; max_tokens: number | null; avg_duration_s: number | null;
}
export interface AgentStats {
  team_id: string;
  agents: Record<string, { all: AgentAgg; with_context: AgentAgg; without_context: AgentAgg }>;
}
export interface QuarantineItem {
  id: string; reasons: string[]; payload: Record<string, unknown>;
  source: string; created_at: string;
}
export interface ProjectItem {
  project_id: string; name: string; repo_url?: string | null; created_at: string;
}
export interface ContributionItem {
  contribution_id: string; entry_id: string; status: string; user_id: string;
  diff_summary: Record<string, string>; created_at: string; decided_at: string | null;
}
export interface TokenItem {
  token_id: string; label: string; created_at: string; revoked: boolean;
  last_used_at: string | null; scopes?: Record<string, unknown>;
}
export interface TeamSettings {
  team_id: string; default_share: "off" | "team" | "global-after-approval";
}

export interface EntryQuery {
  scope: "private" | "global"; team_id?: string; page?: number; per_page?: number;
  verified?: boolean; project_id?: string; seeded?: boolean;
  min_conf?: number; max_conf?: number;
}

/* ---------------------------------------------------------------- calls */
export const api = {
  me: () => get<MeResp>("/auth/me"),
  overview: () => get<Overview>("/me/overview"),

  /* tokens */
  tokens: () => get<TokenItem[]>("/auth/tokens"),
  createToken: (label: string) => post<{ token: string; id: string }>("/auth/tokens", { label }),
  revokeToken: (id: string) => del<{ revoked: boolean }>(`/auth/tokens/${id}`),

  /* invites addressed to me */
  invites: () => get<InviteItem[]>("/invites"),
  acceptInvite: (id: string) => post<{ status: string; team_id?: string }>(`/invites/${id}/accept`),
  declineInvite: (id: string) => post<{ status: string }>(`/invites/${id}/decline`),

  /* teams */
  teams: () => get<MyTeam[]>("/teams"),
  createTeam: (name: string) => post<{ team_id: string; name: string }>("/teams", { name }),
  renameTeam: (teamId: string, name: string) =>
    patch<{ team_id: string; name: string }>(`/teams/${teamId}`, { name }),
  teamMembers: (teamId: string) => get<MemberItem[]>(`/teams/${teamId}/members`),
  setTeamRole: (teamId: string, userId: string, role: string) =>
    post<{ user_id: string; role: string }>(`/teams/${teamId}/role`, { user_id: userId, role }),
  teamInvites: (teamId: string) => get<TeamInviteItem[]>(`/teams/${teamId}/invites`),
  inviteToTeam: (teamId: string, github_login: string, role: string) =>
    post<{ invite_id: string; status: string }>("/invites", { team_id: teamId, github_login, role }),
  addMemberDirect: (teamId: string, github_login: string, role: string) =>
    post<{ invited: string; user_id: string; role: string }>(`/teams/${teamId}/invite`,
      { github_login, role }),
  teamSettings: (teamId: string) => get<TeamSettings>(`/teams/${teamId}/settings`),
  setTeamShare: (teamId: string, default_share: TeamSettings["default_share"]) =>
    patch<TeamSettings>(`/teams/${teamId}/settings`, { default_share }),

  /* projects */
  projects: (teamId: string) => get<ProjectItem[]>(`/projects?team_id=${teamId}`),
  createProject: (body: { team_id: string; name: string; repo_url?: string }) =>
    post<{ project_id: string; created: boolean }>("/projects", body),

  /* entries — the backend wraps the page in a one-element list; the
   * VS Code extension depends on that, so normalise it here. */
  entries: async (q: EntryQuery) => {
    const p = new URLSearchParams();
    p.set("scope", q.scope);
    if (q.team_id) p.set("team_id", q.team_id);
    if (q.page) p.set("page", String(q.page));
    if (q.per_page) p.set("per_page", String(q.per_page));
    if (q.verified !== undefined) p.set("verified", String(q.verified));
    if (q.project_id) p.set("project_id", q.project_id);
    if (q.seeded !== undefined) p.set("seeded", String(q.seeded));
    if (q.min_conf !== undefined) p.set("min_conf", String(q.min_conf));
    if (q.max_conf !== undefined) p.set("max_conf", String(q.max_conf));
    const raw = await get<{ page: number; per_page: number; entries: EntryView[] }[]>(
      `/entries?${p.toString()}`);
    return raw?.[0] ?? { page: 1, per_page: 0, entries: [] };
  },
  entry: (id: string) => get<EntryDetail>(`/entries/${id}`),
  searchEntries: (body: { q: string; scope: "private" | "global"; team_id?: string; limit?: number }) =>
    post<{ results: EntryView[] }>("/entries/search", body),
  verify: (entry_id: string, repo_url: string) =>
    post<{ verified: boolean; log_tail: string }>("/verify", { entry_id, repo_url }),
  promote: (entry_id: string, team_id: string) =>
    post<{ contribution_id: string; status: string; diff: Record<string, string> }>(
      "/promote", { entry_id, team_id }),

  /* runs */
  runs: (teamId: string) => get<RunView[]>(`/runs?team_id=${teamId}`),
  run: (runId: string) => get<RunDetail>(`/runs/${runId}`),

  /* stats */
  statsAgents: (teamId: string) => get<AgentStats>(`/stats/agents?team_id=${teamId}`),

  /* sharing queue */
  contributions: (teamId: string, status?: string) =>
    get<ContributionItem[]>(`/contributions?team_id=${teamId}${status ? `&status=${status}` : ""}`),
  rejectContribution: (id: string) =>
    post<{ contribution_id: string; status: string }>(`/contributions/${id}/reject`),
  approveContribution: (id: string) =>
    post<{ published: boolean; contribution_id: string }>("/promote/approve", { contribution_id: id }),

  /* quarantine */
  quarantine: (teamId: string) => get<QuarantineItem[]>(`/quarantine?team_id=${teamId}`),
  dismissQuarantine: (qid: string) => post<{ dismissed: string }>(`/quarantine/${qid}/dismiss`),

  /* device approval page (session cookie) */
  deviceApproveRoute: (userCode: string, teamId?: string) =>
    `/auth/device/approve?user_code=${encodeURIComponent(userCode)}` +
    (teamId ? `&team_id=${teamId}` : ""),
  deviceApprove: (userCode: string, teamId?: string) =>
    get<{ status: string; team_id?: string }>(api.deviceApproveRoute(userCode, teamId)),
};
