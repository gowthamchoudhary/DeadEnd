/**
 * Typed client for the DeadEnd backend as spoken by /web: cookies
 * (credentials: "include") via the /api proxy (no Bearer here — this is
 * the dashboard, not the runner), 401 → typed UnauthorizedError.
 *
 * Shapes mirror deadend_backend/openapi.json (verified against routers):
 *   GET  /api/auth/me
 *   GET  /api/auth/device/poll|resume   (extension flow only)
 *   GET  /api/auth/device/approve?user_code=  (session-backed)
 *   GET  /api/auth/tokens
 *   GET  /api/invites · POST /api/invites/{id}/accept|decline
 *   GET  /api/me/overview
 *   GET  /api/projects?team_id= · POST /api/projects
 *   GET  /api/contributions?team_id=&status=
 *   POST /api/contributions/{id}/reject
 *   GET/PATCH /api/teams/{id}/settings
 *   GET  /api/stats/agents?team_id=
 *   GET  /api/entries?scope=private&team_id=
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
    throw new Error(detail);
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

const get = <T,>(path: string) => req<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = <T,>(path: string, body: unknown) =>
  req<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/* ---------------------------------------------------------------- types */
export interface MeResp {
  id: string; login: string; name?: string | null; avatar_url?: string | null;
  teams: { team_id: string; role: string }[];
}
export interface InviteItem {
  invite_id: string; team_id: string; team_name: string; role: string; created_at: string;
}
export interface Overview {
  teams: { team_id: string; role: string }[];
  tokens?: boolean;
  entries?: {
    private: number; global_reused: number; verified: number;
  } | null;
  runs?: {
    total: number; success_rate: number | null; total_tokens: number | null;
    time_saved_seconds: number | null;
  } | null;
  repeated_failures?: { signature_hash: string; count: number; title: string }[];
  recent_runs?: { run_id: string; task: string; agent: string; status: string; started_at: string }[];
}
export interface ProjectItem { project_id: string; name: string; repo_url?: string | null; created_at: string }
export interface ContributionItem {
  contribution_id: string; entry_id: string; status: string; user_id: string;
  diff_summary: Record<string, string>; created_at: string; decided_at: string | null;
}
export interface TokenItem {
  token_id: string; label: string; created_at: string; revoked: boolean;
  last_used_at: string | null;
}
export interface TeamSettings { team_id: string; default_share: "off" | "team" | "global-after-approval" }

/* ---------------------------------------------------------------- calls */
export const api = {
  me: () => get<MeResp>("/auth/me"),
  overview: () => get<Overview>("/me/overview"),
  tokens: () => get<TokenItem[]>("/auth/tokens"),
  revokeToken: (id: string) =>
    req<{ revoked: boolean }>(`/auth/tokens/${id}`, { method: "DELETE" }),

  invites: () => get<InviteItem[]>("/invites"),
  acceptInvite: (id: string) => post<{ status: string }>(`/invites/${id}/accept`),
  declineInvite: (id: string) => post<{ status: string }>(`/invites/${id}/decline`),

  projects: (teamId: string) => get<ProjectItem[]>(`/projects?team_id=${teamId}`),
  createProject: (body: { team_id: string; name: string; repo_url?: string }) =>
    post<{ project_id: string; created: boolean }>("/projects", body),

  contributions: (teamId: string) =>
    get<ContributionItem[]>(`/contributions?team_id=${teamId}`),
  rejectContribution: (id: string) =>
    post<{ status: string }>(`/contributions/${id}/reject`),

  teamSettings: (teamId: string) => get<TeamSettings>(`/teams/${teamId}/settings`),
  setTeamShare: (teamId: string, default_share: TeamSettings["default_share"]) =>
    patch<TeamSettings>(`/teams/${teamId}/settings`, { default_share }),

  // device approval page (session cookie)
  deviceApproveRoute: (userCode: string, teamId?: string) =>
    `/auth/device/approve?user_code=${encodeURIComponent(userCode)}` +
    (teamId ? `&team_id=${teamId}` : ""),
  deviceApprove: (userCode: string, teamId?: string) =>
    get<{ status: string; team_id?: string }>(api.deviceApproveRoute(userCode, teamId)),
};
