import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Trash2, Sparkles, Search, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/devotionals")({
  head: () => ({ meta: [{ title: "Devotionals — Shepherd Hub" }] }),
  component: DevotionalsPage,
});

interface Devotional {
  id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  body: string;
  author_id: string;
  publish_date: string;
}

interface AuthorProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

type Filter = "all" | "week" | "month";

function DevotionalsPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Devotional[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorProfile>>({});
  const [leaderIds, setLeaderIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const isLeader = roles.includes("leader") || roles.includes("admin");
  // Anyone signed in can post a devotional now; leaders can manage all.
  const canPost = !!user;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    setBusy(true);
    const { data } = await supabase
      .from("devotionals")
      .select("*")
      .order("publish_date", { ascending: false });
    const list = (data ?? []) as Devotional[];
    setItems(list);

    const authorIds = Array.from(new Set(list.map((d) => d.author_id)));
    if (authorIds.length) {
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", authorIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", authorIds),
      ]);
      const map: Record<string, AuthorProfile> = {};
      (ps ?? []).forEach((p) => { map[p.id] = p as AuthorProfile; });
      setAuthors(map);
      const leaders = new Set<string>();
      (rs ?? []).forEach((r) => {
        if (r.role === "leader" || r.role === "admin") leaders.add(r.user_id);
      });
      setLeaderIds(leaders);
    } else {
      setAuthors({});
      setLeaderIds(new Set());
    }
    setBusy(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    if (!confirm("Delete this devotional?")) return;
    const { error } = await supabase.from("devotionals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  const visible = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      const pd = new Date(d.publish_date);
      if (filter === "week" && pd < weekAgo) return false;
      if (filter === "month" && pd < monthAgo) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.scripture_reference?.toLowerCase().includes(q) ?? false) ||
        d.body.toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todays = items.find((d) => d.publish_date === todayIso);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-serif text-foreground md:text-5xl">Daily Word</h1>
            <p className="mt-2 text-muted-foreground">
              Scripture, reflection, and quiet encouragement from your leaders.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{items.length}</strong> total</span>
              <span>·</span>
              <span>
                <strong className="text-foreground">
                  {items.filter((d) => leaderIds.has(d.author_id)).length}
                </strong>{" "}
                from leaders
              </span>
              {todays && (
                <>
                  <span>·</span>
                  <span className="text-primary">📖 Today's word is posted</span>
                </>
              )}
            </div>
          </div>
          {canPost && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" /> New devotional
                </Button>
              </DialogTrigger>
              <CreateDialog
                userId={user.id}
                onClose={() => setOpen(false)}
                onCreated={load}
              />
            </Dialog>
          )}
        </div>

        {/* Filter & search */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["all", "week", "month"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                  filter === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "all" ? "All" : k === "week" ? "This week" : "This month"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, scripture or text…"
              className="pl-9"
            />
          </div>
        </div>

        {busy ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Empty canManage={canPost} hasItems={items.length > 0} onCreate={() => setOpen(true)} />
        ) : (
          <div className="space-y-5">
            {visible.map((d) => {
              const author = authors[d.author_id];
              const isLeaderAuthor = leaderIds.has(d.author_id);
              return (
              <article
                key={d.id}
                className="rounded-2xl border border-border bg-card p-7"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-primary">
                      {new Date(d.publish_date).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    <h2 className="mt-1 font-serif text-2xl">{d.title}</h2>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      {author?.avatar_url ? (
                        <img src={author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                          <UserIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span>{author?.full_name || "A member"}</span>
                      {isLeaderAuthor && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <ShieldCheck className="h-3 w-3" /> Leader
                        </span>
                      )}
                    </div>
                  </div>
                  {(isLeader || d.author_id === user.id) && (
                    <Button variant="ghost" size="sm" onClick={() => remove(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {d.scripture_reference && (
                  <div
                    className="mt-4 rounded-xl border border-border/60 bg-secondary/40 p-4"
                  >
                    {d.scripture_text && (
                      <p className="font-serif italic text-foreground/90">
                        "{d.scripture_text}"
                      </p>
                    )}
                    <p className="mt-1 text-sm font-medium text-primary">
                      — {d.scripture_reference}
                    </p>
                  </div>
                )}

                <p className="mt-5 whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {d.body}
                </p>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Empty({ canManage, hasItems, onCreate }: { canManage: boolean; hasItems: boolean; onCreate: () => void }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BookOpen className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-xl">
        {hasItems ? "No matches in this view" : "No devotionals yet"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasItems
          ? "Try changing the filter or clearing your search."
          : canManage
            ? "Be the first to share scripture and a short reflection with the community."
            : "When someone posts the Daily Word, it will appear here."}
      </p>
      {canManage && !hasItems && (
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="mr-1 h-4 w-4" /> Post the first devotional
        </Button>
      )}
    </div>
  );
}

function CreateDialog({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [scriptureRef, setScriptureRef] = useState("");
  const [scriptureText, setScriptureText] = useState("");
  const [body, setBody] = useState("");
  const [publishDate, setPublishDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) {
      toast.error("Title and reflection are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("devotionals").insert({
      title,
      scripture_reference: scriptureRef || null,
      scripture_text: scriptureText || null,
      body,
      author_id: userId,
      publish_date: publishDate,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Devotional published");
    onCreated();
    onClose();
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl">Share a Daily Word</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A heart at peace" />
          </div>
          <div>
            <label className="text-sm font-medium">Scripture reference</label>
            <Input value={scriptureRef} onChange={(e) => setScriptureRef(e.target.value)} placeholder="Philippians 4:7" />
          </div>
          <div>
            <label className="text-sm font-medium">Publish date</label>
            <Input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Scripture text</label>
          <Textarea value={scriptureText} onChange={(e) => setScriptureText(e.target.value)} rows={2} placeholder="And the peace of God…" />
        </div>
        <div>
          <label className="text-sm font-medium">Reflection</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Publishing…" : (
              <><Sparkles className="mr-1 h-4 w-4" /> Publish</>
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
