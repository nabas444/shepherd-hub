import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { HandHeart, Plus, MessageSquare, Trash2, CheckCircle2, PauseCircle, ShieldCheck, Users, Pencil, ExternalLink, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/mentorship")({
  head: () => ({ meta: [{ title: "Mentorship — Shepherd Hub" }] }),
  component: MentorshipPage,
});

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  phone?: string | null;
  ministry?: string | null;
}

interface Mentorship {
  id: string;
  mentor_id: string;
  mentee_id: string;
  status: string;
  focus: string | null;
  started_at: string;
  ended_at: string | null;
}

interface Note {
  id: string;
  mentorship_id: string;
  author_id: string;
  body: string;
  created_at: string;
  meeting_date: string | null;
}

function MentorshipPage() {
  const { user, loading, isLeader } = useAuth();
  const navigate = useNavigate();
  const [pairings, setPairings] = useState<Mentorship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [leaderIds, setLeaderIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "completed">("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const load = async () => {
    setLoadingPairs(true);
    const { data: m } = await supabase
      .from("mentorships")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (m ?? []) as Mentorship[];
    setPairings(list);

    const ids = new Set<string>();
    list.forEach((p) => { ids.add(p.mentor_id); ids.add(p.mentee_id); });
    if (ids.size) {
      const idArr = Array.from(ids);
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url, phone, ministry").in("id", idArr),
        supabase.from("user_roles").select("user_id, role").in("user_id", idArr),
      ]);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
      const leaders = new Set<string>();
      (rs ?? []).forEach((r) => {
        if (r.role === "leader" || r.role === "admin") leaders.add(r.user_id);
      });
      setLeaderIds(leaders);
    } else {
      setProfiles({});
      setLeaderIds(new Set());
    }
    setLoadingPairs(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    if (!activeId) { setNotes([]); return; }
    supabase
      .from("mentorship_notes")
      .select("*")
      .eq("mentorship_id", activeId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setNotes((data ?? []) as Note[]));
  }, [activeId]);

  const mine = useMemo(
    () => pairings
      .filter((p) => p.mentor_id === user?.id || p.mentee_id === user?.id)
      .filter((p) => statusFilter === "all" || p.status === statusFilter),
    [pairings, user, statusFilter]
  );
  const others = useMemo(
    () => pairings
      .filter((p) => p.mentor_id !== user?.id && p.mentee_id !== user?.id)
      .filter((p) => statusFilter === "all" || p.status === statusFilter),
    [pairings, user, statusFilter]
  );

  const stats = useMemo(() => ({
    total: pairings.length,
    active: pairings.filter((p) => p.status === "active").length,
    paused: pairings.filter((p) => p.status === "paused").length,
    completed: pairings.filter((p) => p.status === "completed").length,
  }), [pairings]);

  const addNote = async () => {
    if (!activeId || !user || !noteBody.trim()) return;
    setBusy(true);
    const { error, data } = await supabase
      .from("mentorship_notes")
      .insert({
        mentorship_id: activeId,
        author_id: user.id,
        body: noteBody.trim(),
        meeting_date: noteDate || null,
      })
      .select()
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNotes((n) => [data as Note, ...n]);
    setNoteBody("");
    setNoteDate("");
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from("mentorship_notes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setNotes((n) => n.filter((x) => x.id !== id));
  };

  const updateStatus = async (id: string, status: string) => {
    const patch = status === "completed"
      ? { status, ended_at: new Date().toISOString().slice(0, 10) }
      : { status, ended_at: null };
    const { error } = await supabase.from("mentorships").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    load();
  };

  const removePairing = async (id: string) => {
    if (!confirm("Remove this pairing? Notes will be deleted.")) return;
    const { error } = await supabase.from("mentorships").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (activeId === id) setActiveId(null);
    load();
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const active = pairings.find((p) => p.id === activeId) ?? null;

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-serif text-foreground md:text-5xl">Mentorship</h1>
            <p className="mt-2 text-muted-foreground">Pair members, walk together, record check-ins.</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{stats.total}</strong> total</span>
              <span>·</span>
              <span><strong className="text-foreground">{stats.active}</strong> active</span>
              <span>·</span>
              <span>{stats.paused} paused</span>
              <span>·</span>
              <span>{stats.completed} completed</span>
            </div>
          </div>
          {isLeader && <PairDialog onCreated={load} existing={pairings} />}
        </div>

        <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-1">
          {(["all", "active", "paused", "completed"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition ${
                statusFilter === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
          {/* List */}
          <div className="space-y-6">
            {loadingPairs ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                <Section title="Your pairings" pairings={mine} profiles={profiles} leaderIds={leaderIds} userId={user.id}
                  activeId={activeId} onSelect={setActiveId} />
                {isLeader && (
                  <Section title="All other pairings" pairings={others} profiles={profiles} leaderIds={leaderIds} userId={user.id}
                    activeId={activeId} onSelect={setActiveId} />
                )}
                {!mine.length && !others.length && (
                  <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                    <HandHeart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {isLeader
                        ? "No pairings yet. Create the first one to start walking with someone."
                        : "No pairings yet. A leader will pair you soon."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail */}
          <div
            className="rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            {!active ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground">
                <MessageSquare className="mb-3 h-8 w-8" />
                Select a pairing to view check-in notes.
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl font-semibold">
                      {profiles[active.mentor_id]?.full_name || "Mentor"}
                      <span className="mx-2 text-muted-foreground">→</span>
                      {profiles[active.mentee_id]?.full_name || "Mentee"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {active.focus || "No focus set"} · since {new Date(active.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  {isLeader && (
                    <div className="flex items-center gap-2">
                      <Select value={active.status} onValueChange={(v) => updateStatus(active.id, v)}>
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removePairing(active.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mb-4 space-y-2">
                  <Label htmlFor="note">New check-in</Label>
                  <Textarea
                    id="note"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="What did you discuss? Prayer points, next steps…"
                    rows={3}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="meeting-date" className="text-xs text-muted-foreground">
                        Meeting date
                      </Label>
                      <Input
                        id="meeting-date"
                        type="date"
                        value={noteDate}
                        onChange={(e) => setNoteDate(e.target.value)}
                        className="h-8 w-[160px]"
                      />
                    </div>
                    <Button onClick={addNote} disabled={busy || !noteBody.trim()}>
                      Add note
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="rounded-xl border border-border bg-background/50 p-4">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {profiles[n.author_id]?.full_name || "Member"} ·{" "}
                            {new Date(n.created_at).toLocaleString()}
                            {n.meeting_date && (
                              <> · 📅 met {new Date(n.meeting_date).toLocaleDateString()}</>
                            )}
                          </span>
                          {n.author_id === user.id && (
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => deleteNote(n.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  title, pairings, profiles, leaderIds, userId, activeId, onSelect,
}: {
  title: string;
  pairings: Mentorship[];
  profiles: Record<string, Profile>;
  leaderIds: Set<string>;
  userId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!pairings.length) return null;
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {pairings.map((p) => {
          const role = p.mentor_id === userId ? "You mentor" : p.mentee_id === userId ? "Mentored by" : "Pair";
          const mentorIsLeader = leaderIds.has(p.mentor_id);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                activeId === p.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:-translate-y-0.5"
              }`}
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 font-serif text-lg font-semibold">
                    <span>{profiles[p.mentor_id]?.full_name || "Mentor"}</span>
                    {mentorIsLeader && (
                      <ShieldCheck className="h-4 w-4 text-primary" aria-label="Leader" />
                    )}
                    <span className="text-muted-foreground">→</span>
                    <span>{profiles[p.mentee_id]?.full_name || "Mentee"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.mentor_id === userId || p.mentee_id === userId ? `${role} · ` : ""}
                    {p.focus || "—"}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    active: { label: "Active", cls: "bg-primary/10 text-primary", Icon: CheckCircle2 },
    paused: { label: "Paused", cls: "bg-secondary text-secondary-foreground", Icon: PauseCircle },
    completed: { label: "Completed", cls: "bg-muted text-muted-foreground", Icon: CheckCircle2 },
  };
  const cfg = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function PairDialog({ onCreated, existing }: { onCreated: () => void; existing: Mentorship[] }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [memberLeaderIds, setMemberLeaderIds] = useState<Set<string>>(new Set());
  const [mentor, setMentor] = useState("");
  const [mentee, setMentee] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name");
      const list = (data ?? []) as Profile[];
      setMembers(list);
      const ids = list.map((p) => p.id);
      if (ids.length) {
        const { data: rs } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        const leaders = new Set<string>();
        (rs ?? []).forEach((r) => {
          if (r.role === "leader" || r.role === "admin") leaders.add(r.user_id);
        });
        setMemberLeaderIds(leaders);
      }
    })();
  }, [open]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.full_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q)
    );
  }, [members, memberQuery]);

  // Detect duplicate active pairing
  const duplicate = mentor && mentee
    ? existing.find((p) =>
        p.status !== "completed" &&
        ((p.mentor_id === mentor && p.mentee_id === mentee) ||
         (p.mentor_id === mentee && p.mentee_id === mentor))
      )
    : null;

  const submit = async () => {
    if (!user || !mentor || !mentee) return;
    if (mentor === mentee) { toast.error("Mentor and mentee must differ"); return; }
    if (duplicate) { toast.error("These two already have an active pairing"); return; }
    setBusy(true);
    const { error } = await supabase.from("mentorships").insert({
      mentor_id: mentor,
      mentee_id: mentee,
      focus: focus.trim() || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pairing created");
    setOpen(false);
    setMentor(""); setMentee(""); setFocus(""); setMemberQuery("");
    onCreated();
  };

  const renderItem = (m: Profile) => (
    <SelectItem key={m.id} value={m.id}>
      <span className="flex items-center gap-2">
        <span>{m.full_name || m.email || m.id}</span>
        {memberLeaderIds.has(m.id) && (
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Leader" />
        )}
      </span>
    </SelectItem>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> New pairing</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create mentorship pairing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-search" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Filter members
            </Label>
            <Input
              id="member-search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Type a name or email…"
            />
          </div>
          <div className="space-y-2">
            <Label>Mentor</Label>
            <Select value={mentor} onValueChange={setMentor}>
              <SelectTrigger><SelectValue placeholder="Select mentor" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {filteredMembers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No members match.</div>
                ) : filteredMembers.map(renderItem)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mentee</Label>
            <Select value={mentee} onValueChange={setMentee}>
              <SelectTrigger><SelectValue placeholder="Select mentee" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {filteredMembers.filter((m) => m.id !== mentor).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No members match.</div>
                ) : filteredMembers.filter((m) => m.id !== mentor).map(renderItem)}
              </SelectContent>
            </Select>
          </div>
          {duplicate && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              These two already have a {duplicate.status} pairing.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="focus">Focus (optional)</Label>
            <Input id="focus" value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Discipleship basics, prayer life" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !mentor || !mentee || !!duplicate}>
            {busy ? "Creating…" : "Create pairing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}