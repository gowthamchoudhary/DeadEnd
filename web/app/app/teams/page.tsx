"use client";

/** Teams — create, rename, invite by GitHub login, pending invites (both
 * directions), members with roles, the team sharing policy, and the
 * projects list with how many memories each holds. */
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, type EntryView, type MemberItem, type TeamInviteItem } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Btn, Card, ErrorNote, Field, PageHead, SectionTitle,
  Select, SkeletonRows, inputCls,
} from "@/components/dashboard/ui";

const ROLES = ["owner", "admin", "member"] as const;

export default function TeamsPage() {
  const { me, teams, teamId, role, refreshTeams } = useTeam();
  const canAdmin = role === "owner" || role === "admin";
  const [note, setNote] = useState<string>("");

  const { data: members, isLoading: loadingMembers, mutate: refetchMembers } =
    useSWR<MemberItem[], Error>(teamId ? ["members", teamId] : null,
      () => api.teamMembers(teamId), { shouldRetryOnError: false });
  const { data: teamInvites, error: invitesErr, mutate: refetchTeamInvites } =
    useSWR<TeamInviteItem[], Error>(
      teamId && canAdmin ? ["team-invites", teamId] : null,
      () => api.teamInvites(teamId), { shouldRetryOnError: false });
  const { data: myInvites, mutate: refetchMyInvites } =
    useSWR("invites", api.invites, { shouldRetryOnError: false });
  const { data: settings, mutate: refetchSettings } =
    useSWR(teamId ? ["settings", teamId] : null, () => api.teamSettings(teamId));
  const { data: entries } = useSWR(teamId ? ["entries-for-projects", teamId] : null,
    () => api.entries({ scope: "private", team_id: teamId, per_page: 100 }));
  const { data: projects, mutate: refetchProjects } =
    useSWR(teamId ? ["projects", teamId] : null, () => api.projects(teamId));

  const active = teams.find((t) => t.team_id === teamId);

  return (
    <div className="space-y-8">
      <PageHead title="Teams" sub="Who you share with, and how memories move between your team and the global pool." />
      <ErrorNote error={invitesErr} />
      {note && <p role="status" className="text-small text-text-secondary">{note}</p>}

      {/* my teams + create */}
      <section>
        <SectionTitle>Your teams</SectionTitle>
        <div className="grid md:grid-cols-2 gap-3">
          {teams.map((t) => (
            <Card key={t.team_id} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-small text-text-primary truncate">{t.name}</div>
                <div className="text-tiny text-text-muted font-mono">{t.members} member{t.members === 1 ? "" : "s"}</div>
              </div>
              <div className="flex items-center gap-2">
                {t.role !== "member" && <Badge tone={t.role === "owner" ? "good" : "muted"}>{t.role}</Badge>}
                {t.team_id === teamId && <Badge>active</Badge>}
              </div>
            </Card>
          ))}
        </div>
        <CreateTeam onDone={async () => { await refreshTeams(); setNote("Team created."); }} />
      </section>

      {/* rename active team */}
      {active && canAdmin && (
        <section>
          <SectionTitle>Rename “{active.name}”</SectionTitle>
          <RenameTeam teamId={teamId} initial={active.name}
            onDone={async () => { await refreshTeams(); setNote("Renamed."); }} />
        </section>
      )}

      {/* sharing policy */}
      <section>
        <SectionTitle>Sharing policy</SectionTitle>
        <Card className="px-4 py-4 flex flex-wrap items-center gap-3">
          <Select aria-label="Team sharing policy" value={settings?.default_share ?? "off"}
            disabled={!canAdmin}
            onChange={async (e) => {
              await api.setTeamShare(teamId, e.target.value as "off" | "team" | "global-after-approval");
              refetchSettings();
            }}>
            <option value="off">off — nothing is shared automatically</option>
            <option value="team">team — new memories stay inside the team</option>
            <option value="global-after-approval">global after approval — promotion still needs an explicit approve</option>
          </Select>
          {!canAdmin && <span className="text-tiny text-text-muted">only owners and admins can change this</span>}
        </Card>
      </section>

      {/* members */}
      <section>
        <SectionTitle>Members</SectionTitle>
        <Card className="divide-y divide-line-900">
          {loadingMembers && <div className="px-4 py-4"><SkeletonRows n={2} h="h-8" /></div>}
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
              <span className="text-small text-text-primary">{m.login}</span>
              {m.user_id === me.id && <Badge>muted-you</Badge>}
              {canAdmin && m.user_id !== me.id ? (
                <Select aria-label={`Role for ${m.login}`} value={m.role}
                  onChange={async (e) => {
                    await api.setTeamRole(teamId, m.user_id, e.target.value);
                    refetchMembers();
                  }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              ) : (
                <span className="ml-auto text-tiny text-text-muted">{m.role}</span>
              )}
            </div>
          ))}
          {!loadingMembers && !(members ?? []).length && (
            <p className="px-4 py-5 text-small text-text-muted">No members loaded yet.</p>
          )}
        </Card>
      </section>

      {/* invites */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div>
          <SectionTitle>Invite by GitHub username</SectionTitle>
          <InviteForm teamId={teamId} canAdmin={canAdmin}
            onDone={async (msg) => {
              setNote(msg);
              await refetchTeamInvites();
              refetchMembers();
            }} />
        </div>
        <div>
          <SectionTitle>Pending invites to this team</SectionTitle>
          <Card className="divide-y divide-line-900">
            {(teamInvites ?? []).map((i) => (
              <div key={i.invite_id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-small text-text-secondary font-mono">{i.github_login}</span>
                <Badge>{i.role}</Badge>
                <span className="ml-auto text-tiny text-text-muted">
                  from {i.invited_by ?? "—"}
                </span>
              </div>
            ))}
            {!teamInvites?.length && (
              <p className="px-4 py-5 text-small text-text-muted">
                No invites waiting on this team.
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* invites addressed to me */}
      {!!myInvites?.length && (
        <section>
          <SectionTitle>Invites waiting for you</SectionTitle>
          <Card className="divide-y divide-line-900">
            {myInvites.map((i) => (
              <div key={i.invite_id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-small text-text-secondary">{i.team_name} · {i.role}</span>
                <div className="ml-auto flex gap-2">
                  <Btn variant="fill" onClick={async () => {
                    await api.acceptInvite(i.invite_id);
                    await refreshTeams();
                    refetchMyInvites();
                  }}>Accept</Btn>
                  <Btn onClick={async () => {
                    await api.declineInvite(i.invite_id);
                    refetchMyInvites();
                  }}>Decline</Btn>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* projects */}
      <section>
        <SectionTitle right={<span className="text-tiny text-text-muted">latest 100 private memories counted</span>}>
          Projects
        </SectionTitle>
        <Card className="divide-y divide-line-900">
          {(projects ?? []).map((p) => {
            const count = (entries?.entries ?? []).filter((e: EntryView) => e.project_id === p.project_id).length;
            return (
              <div key={p.project_id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-small text-text-primary">{p.name}</span>
                {p.repo_url && <span className="text-tiny text-text-muted font-mono truncate max-w-[14rem]">{p.repo_url}</span>}
                <span className="ml-auto text-tiny text-text-muted">
                  {count} memor{count === 1 ? "y" : "ies"}
                </span>
              </div>
            );
          })}
          {projects && !projects.length && (
            <p className="px-4 py-5 text-small text-text-muted">
              No projects yet — one is created automatically the first time a run
              or ingest records a repo name.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- parts */
function CreateTeam({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try { await api.createTeam(name.trim()); setName(""); onDone(); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : "failed"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-3">
      <Field label="Create a team">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="team name" className={inputCls} />
          <Btn variant="fill" type="submit" disabled={busy || !name.trim()}>Create</Btn>
        </div>
      </Field>
      {err && <p role="alert" className="text-tiny text-brand-danger mt-1">{err}</p>}
    </form>
  );
}

function RenameTeam({ teamId, initial, onDone }: {
  teamId: string; initial: string; onDone: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === initial) return;
    setBusy(true); setErr("");
    try { await api.renameTeam(teamId, name.trim()); onDone(); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : "failed"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit}>
      <Card className="px-4 py-4">
        <Field label="Team name (globally unique)">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            <Btn variant="fill" type="submit" disabled={busy || name === initial || !name.trim()}>
              Rename
            </Btn>
          </div>
        </Field>
        {err && <p role="alert" className="text-tiny text-brand-danger mt-2">{err}</p>}
      </Card>
    </form>
  );
}

function InviteForm({ teamId, canAdmin, onDone }: {
  teamId: string; canAdmin: boolean; onDone: (msg: string) => void;
}) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [direct, setDirect] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!login.trim()) return;
    setBusy(true); setErr("");
    try {
      if (direct) {
        await api.addMemberDirect(teamId, login.trim(), role);
        onDone(`${login.trim()} added to the team.`);
      } else {
        await api.inviteToTeam(teamId, login.trim(), role);
        onDone(`Invite sent to ${login.trim()} — they accept it from their own Teams page.`);
      }
      setLogin("");
    } catch (ex) {
      const m = ex instanceof Error ? ex.message : "failed";
      if (!direct && m.includes("not on DeadEnd")) {
        setErr("They don't have a DeadEnd account yet. Ask them to sign in once, or add them directly (creates their account).");
        setDirect(true);
      } else setErr(m);
    } finally { setBusy(false); }
  }

  if (!canAdmin) {
    return <Card className="px-4 py-4 text-small text-text-muted">
      Only owners and admins can invite.
    </Card>;
  }

  return (
    <form onSubmit={submit}>
      <Card className="px-4 py-4 space-y-3">
        <Field label="GitHub username" hint={direct
          ? "Direct add creates their DeadEnd account from their public GitHub profile."
          : "They must have signed in to DeadEnd at least once."}>
          <input value={login} onChange={(e) => { setLogin(e.target.value); setDirect(false); }}
            placeholder="octocat" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-2">
          <Btn variant="fill" type="submit" disabled={busy || !login.trim()}>
            {busy ? "Sending…" : direct ? "Add directly" : "Send invite"}
          </Btn>
          {direct && (
            <button type="button" onClick={() => setDirect(false)}
              className="text-tiny text-text-muted hover:text-text-secondary">
              back to invite
            </button>
          )}
        </div>
        {err && <p role="alert" className="text-tiny text-brand-danger">{err}</p>}
      </Card>
    </form>
  );
}
