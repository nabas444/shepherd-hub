import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { HandHeart, Plus, MessageSquare, Trash2, CheckCircle2, PauseCircle } from "lucide-react";
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const load = async () => {
    const { data: m } = await supabase
      .from("mentorships")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (m ?? []) as Mentorship[];
    setPairings(list);

    const ids = new Set<string>();
    list.forEach((p) => { ids.add(p.mentor_id); ids.add(p.mentee_id); });
    if (ids.size) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", Array.from(ids));
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
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
    () => pairings.filter((p) => p.mentor_id === user?.id || p.mentee_id === user?.id),
    [pairings, user]
  );
  const others = useMemo(
    () => pairings.filter((p) => p.mentor_id !== user?.id && p.mentee_id !== user?.id),
    [pairings, user]
  );

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
          </div>
          {isLeader && <PairDialog onCreated={load} />}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
          {/* List */}
          <div className="space-y-6">
            <Section title="Your pairings" pairings={mine} profiles={profiles} userId={user.id}
              activeId={activeId} onSelect={setActiveId} />
            {isLeader && (
              <Section title="All other pairings" pairings={others} profiles={profiles} userId={user.id}
                activeId={activeId} onSelect={setActiveId} />
            )}
            {!mine.length && !isLeader && (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                <HandHeart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">No pairings yet. A leader will pair you soon.</p>
              </div>
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
                  <div className="flex justify-end">
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
  title, pairings, profiles, userId, activeId, onSelect,
}: {
  title: string;
  pairings: Mentorship[];
  profiles: Record<string, Profile>;
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
          const isMentor = p.mentor_id === userId;
          const other = isMentor ? profiles[p.mentee_id] : profiles[p.mentor_id];
          const role = p.mentor_id === userId ? "You mentor" : p.mentee_id === userId ? "Mentored by" : "Pair";
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
                  <div className="font-serif text-lg font-semibold">
                    {profiles[p.mentor_id]?.full_name || "Mentor"}
                    <span className="mx-2 text-muted-foreground">→</span>
                    {profiles[p.mentee_id]?.full_name || "Mentee"}
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

function PairDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [mentor, setMentor] = useState("");
  const [mentee, setMentee] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .order("full_name")
      .then(({ data }) => setMembers((data ?? []) as Profile[]));
  }, [open]);

  const submit = async () => {
    if (!user || !mentor || !mentee) return;
    if (mentor === mentee) { toast.error("Mentor and mentee must differ"); return; }
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
    setMentor(""); setMentee(""); setFocus("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> New pairing</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create mentorship pairing</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mentor</Label>
            <Select value={mentor} onValueChange={setMentor}>
              <SelectTrigger><SelectValue placeholder="Select mentor" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mentee</Label>
            <Select value={mentee} onValueChange={setMentee}>
              <SelectTrigger><SelectValue placeholder="Select mentee" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="focus">Focus (optional)</Label>
            <Input id="focus" value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Discipleship basics, prayer life" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !mentor || !mentee}>Create pairing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}