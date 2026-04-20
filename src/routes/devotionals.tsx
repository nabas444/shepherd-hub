import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Trash2, Sparkles } from "lucide-react";
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

function DevotionalsPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Devotional[]>([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const canManage = roles.includes("leader") || roles.includes("admin");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    setBusy(true);
    const { data } = await supabase
      .from("devotionals")
      .select("*")
      .order("publish_date", { ascending: false });
    setItems((data ?? []) as Devotional[]);
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
              Scripture, reflection, and quiet encouragement.
            </p>
          </div>
          {canManage && (
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

        {busy ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-5">
            {items.map((d) => (
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
                  </div>
                  {canManage && (
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
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Empty() {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BookOpen className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-xl">No devotionals yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        When a leader posts the Daily Word, it will appear here.
      </p>
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
