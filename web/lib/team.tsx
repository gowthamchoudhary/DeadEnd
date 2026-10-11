"use client";

/** Team/workspace context for the whole /app shell: which team is active
 * (persisted in localStorage), its role, its projects, the top bar's
 * project filter and search term. All of it comes from the backend — the
 * team list is GET /teams (the only endpoint that carries team names). */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { api, type MeResp, type MyTeam, type ProjectItem } from "./api";

const LS_KEY = "deadend.team";

interface TeamCtx {
  me: MeResp;
  teams: MyTeam[];
  teamsLoading: boolean;
  teamId: string;
  team: MyTeam | null;
  role: string;
  selectTeam: (id: string) => void;
  projects: ProjectItem[];
  projectById: (id: string | null) => string;
  projectFilter: string;          // "" = all projects
  setProjectFilter: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
  refreshTeams: () => Promise<unknown>;
}

const Ctx = createContext<TeamCtx | null>(null);

export function TeamProvider({ me, children }: { me: MeResp; children: ReactNode }) {
  const { data: teams = [], isLoading, mutate: refreshTeams } =
    useSWR<MyTeam[], Error>("teams", api.teams, { shouldRetryOnError: false });

  const [picked, setPicked] = useState<string>("");
  useEffect(() => {
    const ls = localStorage.getItem(LS_KEY);
    if (ls && teams.some((t) => t.team_id === ls)) setPicked(ls);
    else if (!picked && teams.length) setPicked(teams[0].team_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const selectTeam = useCallback((id: string) => {
    setPicked(id);
    localStorage.setItem(LS_KEY, id);
    setProjectFilter("");
  }, []);

  const teamId = picked || teams[0]?.team_id || "";
  const team = useMemo(() => teams.find((t) => t.team_id === teamId) ?? null, [teams, teamId]);
  const role = team?.role ?? me.teams.find((t) => t.team_id === teamId)?.role ?? "member";

  const { data: projects = [] } = useSWR<ProjectItem[]>(
    teamId ? ["projects", teamId] : null,
    ([, id]) => api.projects(id as string),
    { shouldRetryOnError: false }
  );

  const [projectFilter, setProjectFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const projectById = useCallback(
    (id: string | null) => (id ? projects.find((p) => p.project_id === id)?.name ?? id.slice(0, 8) : "—"),
    [projects]
  );

  const value = useMemo<TeamCtx>(() => ({
    me, teams, teamsLoading: isLoading, teamId, team, role, selectTeam,
    projects, projectById, projectFilter, setProjectFilter, search, setSearch,
    refreshTeams,
  }), [me, teams, isLoading, teamId, team, role, selectTeam, projects,
       projectById, projectFilter, search, refreshTeams]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeam(): TeamCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTeam must be used inside <TeamProvider>");
  return v;
}
