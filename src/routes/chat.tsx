import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash, Send, Trash2, Plus, Paperclip, X, Pencil, Check, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Community Chat — Shepherd Hub" }] }),
  component: ChatPage,
});

interface Channel {
  id: string;
  name: string;
  description: string | null;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  body: string | null;
  created_at: string;
  edited_at?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string;
}

function ChatPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [openNewChannel, setOpenNewChannel] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isAdmin = roles.includes("admin");
  const isLeader = roles.includes("leader") || isAdmin;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load channels
  useEffect(() => {
    if (!user) return;
    supabase
      .from("chat_channels")
      .select("id,name,description")
      .order("name")
      .then(({ data }) => {
        const list = (data ?? []) as Channel[];
        setChannels(list);
        if (list.length && !activeId) setActiveId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load + subscribe to messages of active channel
  useEffect(() => {
    if (!activeId) return;
    setBusy(true);
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id,channel_id,user_id,body,created_at,edited_at,attachment_url,attachment_type,attachment_name")
        .eq("channel_id", activeId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      const msgs = (data ?? []) as Message[];
      setMessages(msgs);
      await hydrateProfiles(msgs.map((m) => m.user_id));
      setBusy(false);
      requestAnimationFrame(() => scrollToBottom());
    })();

    const channel = supabase
      .channel(`chat:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeId}` },
        async (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]));
          await hydrateProfiles([msg.user_id]);
          requestAnimationFrame(() => scrollToBottom());
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const hydrateProfiles = async (userIds: string[]) => {
    const missing = Array.from(new Set(userIds)).filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", missing);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        data.forEach((p) => (next[p.id] = p as ProfileLite));
        return next;
      });
    }
  };

  const scrollToBottom = () => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeId) return;
    const body = draft.trim().slice(0, 2000);
    if (!body && !pendingFile) return;

    let attachment_url: string | null = null;
    let attachment_type: string | null = null;
    let attachment_name: string | null = null;

    if (pendingFile) {
      if (pendingFile.size > 25 * 1024 * 1024) {
        toast.error("File too large (max 25MB)");
        return;
      }
      setUploading(true);
      const ext = pendingFile.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (upErr) {
        setUploading(false);
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      attachment_url = pub.publicUrl;
      attachment_type = pendingFile.type || "application/octet-stream";
      attachment_name = pendingFile.name;
      setUploading(false);
    }

    setDraft("");
    const file = pendingFile;
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeId,
      user_id: user.id,
      body: body || null,
      attachment_url,
      attachment_type,
      attachment_name,
    });
    if (error) {
      toast.error(error.message);
      setDraft(body);
      setPendingFile(file);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const startEdit = (m: Message) => {
    setEditingId(m.id);
    setEditingDraft(m.body ?? "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const body = editingDraft.trim().slice(0, 2000);
    if (!body) return toast.error("Message cannot be empty");
    const { error } = await supabase
      .from("chat_messages")
      .update({ body })
      .eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditingId(null);
    setEditingDraft("");
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const active = channels.find((c) => c.id === activeId) ?? null;

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-serif text-foreground md:text-5xl">Community</h1>
          <p className="mt-2 text-muted-foreground">Open hearts, kind words, real time.</p>
        </div>

        <div
          className="grid gap-0 overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-[240px_1fr]"
          style={{ boxShadow: "var(--shadow-soft)", height: "calc(100vh - 260px)", minHeight: 500 }}
        >
          {/* Sidebar */}
          <aside className="border-b border-border md:border-b-0 md:border-r">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channels
              </span>
              {isAdmin && (
                <Dialog open={openNewChannel} onOpenChange={setOpenNewChannel}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <NewChannelDialog
                    onClose={() => setOpenNewChannel(false)}
                    onCreated={(c) => {
                      setChannels((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
                      setActiveId(c.id);
                    }}
                  />
                </Dialog>
              )}
            </div>
            <ul className="px-2 pb-3">
              {channels.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition ${
                      activeId === c.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-secondary"
                    }`}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Main */}
          <section className="flex min-h-0 flex-col">
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 font-serif text-lg font-semibold">
                <Hash className="h-4 w-4 text-primary" />
                {active?.name ?? "Select a channel"}
              </div>
              {active?.description && (
                <p className="text-xs text-muted-foreground">{active.description}</p>
              )}
            </div>

            <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {busy ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No messages yet — be the first to share.
                </div>
              ) : (
                messages.map((m) => {
                  const author = profiles[m.user_id]?.full_name || "Member";
                  const mine = m.user_id === user.id;
                  const canDelete = mine || isLeader;
                  const isEditing = editingId === m.id;
                  return (
                    <div key={m.id} className="group flex gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {author.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{author}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.edited_at && (
                            <span className="text-[10px] italic text-muted-foreground">(edited)</span>
                          )}
                          <div className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                            {mine && !isEditing && m.body && (
                              <button onClick={() => startEdit(m)} aria-label="Edit message">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                              </button>
                            )}
                            {canDelete && !isEditing && (
                              <button onClick={() => remove(m.id)} aria-label="Delete message">
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="mt-1 flex gap-2">
                            <Input
                              value={editingDraft}
                              onChange={(e) => setEditingDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                            />
                            <Button size="sm" onClick={saveEdit}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            {m.body && (
                              <p className="whitespace-pre-wrap break-words text-foreground/90">{m.body}</p>
                            )}
                            {m.attachment_url && (
                              <Attachment
                                url={m.attachment_url}
                                type={m.attachment_type ?? ""}
                                name={m.attachment_name ?? "file"}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={send} className="flex flex-col gap-2 border-t border-border bg-background/40 p-3">
              {pendingFile && (
                <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="truncate">{pendingFile.name}</span>
                  <span className="text-muted-foreground">
                    ({(pendingFile.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="ml-auto"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.doc,.docx,.txt,.zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!active || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={active ? `Message #${active.name}` : "Select a channel…"}
                  disabled={!active}
                  maxLength={2000}
                />
                <Button
                  type="submit"
                  disabled={!active || uploading || (!draft.trim() && !pendingFile)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function NewChannelDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) return toast.error("Name required");
    setSaving(true);
    const { data, error } = await supabase
      .from("chat_channels")
      .insert({ name: clean, description: description || null })
      .select("id,name,description")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Channel created");
    onCreated(data as Channel);
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl">Start a channel</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="prayer-requests" />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
