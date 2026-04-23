import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash, Send, Trash2, Plus, Paperclip, X, Pencil, Check, FileText, Download, Smile, MessageSquare, CornerDownRight, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Community Chat — Shepherd Hub" }] }),
  component: ChatPage,
});

interface Channel {
  id: string;
  name: string;
  description: string | null;
  leader_only?: boolean;
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
  parent_id?: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

const REACTION_EMOJIS = ["❤️", "🙏", "🙌", "🔥", "👍", "😂"];

function ChatPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [allProfiles, setAllProfiles] = useState<ProfileLite[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lastReads, setLastReads] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [openNewChannel, setOpenNewChannel] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadOf, setThreadOf] = useState<Message | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = roles.includes("admin");
  const isLeader = roles.includes("leader") || isAdmin;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Load all profiles once (for mentions)
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("id,full_name").then(({ data }) => {
      const list = (data ?? []) as ProfileLite[];
      setAllProfiles(list);
      const map: Record<string, ProfileLite> = {};
      list.forEach((p) => (map[p.id] = p));
      setProfiles((prev) => ({ ...map, ...prev }));
    });
  }, [user]);

  // Load channels + last_read
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: chs }, { data: reads }] = await Promise.all([
        supabase.from("chat_channels").select("id,name,description,leader_only").order("name"),
        supabase.from("chat_reads").select("channel_id,last_read_at").eq("user_id", user.id),
      ]);
      const list = (chs ?? []) as Channel[];
      setChannels(list);
      const readsMap: Record<string, string> = {};
      (reads ?? []).forEach((r) => (readsMap[r.channel_id] = r.last_read_at));
      setLastReads(readsMap);
      if (list.length && !activeId) setActiveId(list[0].id);
      // Compute unread counts
      await refreshUnread(list, readsMap, user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshUnread = async (chs: Channel[], reads: Record<string, string>, uid: string) => {
    const counts: Record<string, number> = {};
    await Promise.all(
      chs.map(async (c) => {
        const since = reads[c.id] ?? "1970-01-01";
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", c.id)
          .gt("created_at", since)
          .neq("user_id", uid);
        counts[c.id] = count ?? 0;
      }),
    );
    setUnread(counts);
  };

  // Load messages + reactions of active channel + subscribe
  useEffect(() => {
    if (!activeId || !user) return;
    setBusy(true);
    let cancelled = false;

    (async () => {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id,channel_id,user_id,body,created_at,edited_at,attachment_url,attachment_type,attachment_name,parent_id")
        .eq("channel_id", activeId)
        .order("created_at", { ascending: true })
        .limit(300);
      if (cancelled) return;
      const list = (msgs ?? []) as Message[];
      setMessages(list);
      await hydrateProfiles(list.map((m) => m.user_id));

      const ids = list.map((m) => m.id);
      if (ids.length) {
        const { data: rx } = await supabase
          .from("chat_reactions")
          .select("id,message_id,user_id,emoji")
          .in("message_id", ids);
        setReactions((rx ?? []) as Reaction[]);
      } else {
        setReactions([]);
      }

      // Mark channel read
      await supabase.from("chat_reads").upsert(
        { user_id: user.id, channel_id: activeId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,channel_id" },
      );
      setLastReads((prev) => ({ ...prev, [activeId]: new Date().toISOString() }));
      setUnread((prev) => ({ ...prev, [activeId]: 0 }));

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
          // Mark read on incoming if active
          if (user && msg.user_id !== user.id) {
            await supabase.from("chat_reads").upsert(
              { user_id: user.id, channel_id: activeId, last_read_at: new Date().toISOString() },
              { onConflict: "user_id,channel_id" },
            );
          }
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const r = payload.new as Reaction;
            setReactions((prev) => (prev.find((x) => x.id === r.id) ? prev : [...prev, r]));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setReactions((prev) => prev.filter((x) => x.id !== old.id));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, user]);

  // Listen across all channels for unread bumps
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("chat:global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.user_id === user.id) return;
          if (msg.channel_id === activeId) return;
          setUnread((prev) => ({ ...prev, [msg.channel_id]: (prev[msg.channel_id] ?? 0) + 1 }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, activeId]);

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

  // Parse @mentions in body and resolve to user ids
  const parseMentions = (body: string): string[] => {
    const re = /@([a-zA-Z][a-zA-Z0-9_-]{1,30})/g;
    const handles = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) handles.add(m[1].toLowerCase());
    if (handles.size === 0) return [];
    const ids: string[] = [];
    allProfiles.forEach((p) => {
      const handle = (p.full_name || "").toLowerCase().replace(/\s+/g, "");
      if (handles.has(handle)) ids.push(p.id);
    });
    return ids;
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

    const parent_id = (threadOf?.id ?? replyTo?.id) || null;
    setDraft("");
    const file = pendingFile;
    setPendingFile(null);
    setReplyTo(null);
    setMentionQuery(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: activeId,
        user_id: user.id,
        body: body || null,
        attachment_url,
        attachment_type,
        attachment_name,
        parent_id,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      setDraft(body);
      setPendingFile(file);
      return;
    }

    // Insert mentions
    if (body && inserted) {
      const ids = parseMentions(body);
      if (ids.length) {
        await supabase
          .from("chat_mentions")
          .insert(ids.map((mid) => ({ message_id: inserted.id, mentioned_user_id: mid })));
      }
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

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(
      (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji,
    );
    if (existing) {
      await supabase.from("chat_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("chat_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    const cursor = inputRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const m = before.match(/@([a-zA-Z0-9_-]*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const insertMention = (p: ProfileLite) => {
    const handle = (p.full_name || "member").replace(/\s+/g, "");
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor).replace(/@([a-zA-Z0-9_-]*)$/, `@${handle} `);
    const after = draft.slice(cursor);
    setDraft(before + after);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return allProfiles
      .filter((p) => (p.full_name || "").toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, allProfiles]);

  const repliesByParent = useMemo(() => {
    const map: Record<string, Message[]> = {};
    messages.forEach((m) => {
      if (m.parent_id) (map[m.parent_id] ||= []).push(m);
    });
    return map;
  }, [messages]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const active = channels.find((c) => c.id === activeId) ?? null;
  const topLevel = messages.filter((m) => !m.parent_id);
  const threadReplies = threadOf ? repliesByParent[threadOf.id] ?? [] : [];
  const generalChannels = channels.filter((c) => !c.leader_only);
  const leaderChannels = channels.filter((c) => c.leader_only);

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
                  <NewChannelDialogImpl
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
              {generalChannels.map((c) => (
                <ChannelButton
                  key={c.id}
                  channel={c}
                  active={activeId === c.id}
                  count={unread[c.id] ?? 0}
                  onClick={() => setActiveId(c.id)}
                />
              ))}
              {leaderChannels.length > 0 && (
                <>
                  <li className="mt-3 flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Lock className="h-3 w-3" /> Leaders
                  </li>
                  {leaderChannels.map((c) => (
                    <ChannelButton
                      key={c.id}
                      channel={c}
                      active={activeId === c.id}
                      count={unread[c.id] ?? 0}
                      onClick={() => setActiveId(c.id)}
                    />
                  ))}
                </>
              )}
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
              ) : topLevel.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No messages yet — be the first to share.
                </div>
              ) : (
                topLevel.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    replies={repliesByParent[m.id] ?? []}
                    profiles={profiles}
                    reactions={reactions.filter((r) => r.message_id === m.id)}
                    currentUserId={user.id}
                    isLeader={isLeader}
                    editingId={editingId}
                    editingDraft={editingDraft}
                    setEditingDraft={setEditingDraft}
                    onStartEdit={startEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={saveEdit}
                    onDelete={remove}
                    onReact={toggleReaction}
                    onReply={(msg) => setReplyTo(msg)}
                    onOpenThread={(msg) => setThreadOf(msg)}
                  />
                ))
              )}
            </div>

            <form onSubmit={send} className="flex flex-col gap-2 border-t border-border bg-background/40 p-3">
              {replyTo && (
                <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
                  <CornerDownRight className="h-3.5 w-3.5" />
                  <span className="text-muted-foreground">Replying to</span>
                  <span className="font-medium">{profiles[replyTo.user_id]?.full_name || "Member"}</span>
                  <span className="truncate text-muted-foreground">: {replyTo.body?.slice(0, 60) ?? "attachment"}</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="ml-auto">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              )}
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
              {mentionMatches.length > 0 && (
                <div className="rounded-md border border-border bg-popover p-1 shadow-md">
                  {mentionMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => insertMention(p)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                        {(p.full_name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{p.full_name || "Member"}</span>
                      <span className="ml-auto text-xs text-muted-foreground">@{(p.full_name || "").replace(/\s+/g, "")}</span>
                    </button>
                  ))}
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
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder={active ? `Message #${active.name} — use @ to mention` : "Select a channel…"}
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

      {/* Thread drawer */}
      {threadOf && (
        <ThreadDrawer
          parent={threadOf}
          replies={threadReplies}
          profiles={profiles}
          reactions={reactions}
          currentUserId={user.id}
          isLeader={isLeader}
          onClose={() => setThreadOf(null)}
          channelId={activeId!}
          allProfiles={allProfiles}
        />
      )}
    </AppShell>
  );
}

interface MessageRowProps {
  m: Message;
  replies: Message[];
  profiles: Record<string, ProfileLite>;
  reactions: Reaction[];
  currentUserId: string;
  isLeader: boolean;
  editingId: string | null;
  editingDraft: string;
  setEditingDraft: (v: string) => void;
  onStartEdit: (m: Message) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (m: Message) => void;
  onOpenThread: (m: Message) => void;
}

function MessageRow({
  m, replies, profiles, reactions, currentUserId, isLeader,
  editingId, editingDraft, setEditingDraft,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete, onReact, onReply, onOpenThread,
}: MessageRowProps) {
  const author = profiles[m.user_id]?.full_name || "Member";
  const mine = m.user_id === currentUserId;
  const canDelete = mine || isLeader;
  const isEditing = editingId === m.id;

  // Group reactions
  const grouped: Record<string, Reaction[]> = {};
  reactions.forEach((r) => (grouped[r.emoji] ||= []).push(r));

  return (
    <div className="group flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {author.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{author}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(m.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          {m.edited_at && <span className="text-[10px] italic text-muted-foreground">(edited)</span>}
          <div className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="Add reaction"><Smile className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" /></button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1" align="end">
                <div className="flex gap-1">
                  {REACTION_EMOJIS.map((e) => (
                    <button key={e} onClick={() => onReact(m.id, e)} className="rounded p-1 text-lg hover:bg-secondary">
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={() => onReply(m)} aria-label="Reply">
              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
            </button>
            {mine && !isEditing && m.body && (
              <button onClick={() => onStartEdit(m)} aria-label="Edit message">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
              </button>
            )}
            {canDelete && !isEditing && (
              <button onClick={() => onDelete(m.id)} aria-label="Delete message">
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
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
            />
            <Button size="sm" onClick={onSaveEdit}><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <>
            {m.body && <MessageBody body={m.body} />}
            {m.attachment_url && (
              <Attachment
                url={m.attachment_url}
                type={m.attachment_type ?? ""}
                name={m.attachment_name ?? "file"}
              />
            )}
          </>
        )}

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(grouped).map(([emoji, list]) => {
              const reacted = list.some((r) => r.user_id === currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(m.id, emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                    reacted ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary"
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{list.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread indicator */}
        {replies.length > 0 && (
          <button
            onClick={() => onOpenThread(m)}
            className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBody({ body }: { body: string }) {
  // Highlight @mentions
  const parts = body.split(/(@[a-zA-Z][a-zA-Z0-9_-]{1,30})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-foreground/90">
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function Attachment({ url, type, name }: { url: string; type: string; name: string }) {
  if (type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
        <img src={url} alt={name} className="max-h-80 max-w-sm rounded-md border border-border object-cover" loading="lazy" />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return <video src={url} controls className="mt-2 max-h-80 max-w-sm rounded-md border border-border" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex max-w-sm items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/70"
    >
      <FileText className="h-4 w-4 text-primary" />
      <span className="truncate">{name}</span>
      <Download className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
    </a>
  );
}

function ThreadDrawer({
  parent, replies, profiles, reactions, currentUserId, isLeader, onClose, channelId, allProfiles,
}: {
  parent: Message;
  replies: Message[];
  profiles: Record<string, ProfileLite>;
  reactions: Reaction[];
  currentUserId: string;
  isLeader: boolean;
  onClose: () => void;
  channelId: string;
  allProfiles: ProfileLite[];
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim().slice(0, 2000);
    if (!body) return;
    setSending(true);
    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: channelId, user_id: currentUserId, body, parent_id: parent.id })
      .select("id")
      .single();
    setSending(false);
    if (error) return toast.error(error.message);
    setDraft("");

    // mentions
    const re = /@([a-zA-Z][a-zA-Z0-9_-]{1,30})/g;
    const handles = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) handles.add(m[1].toLowerCase());
    if (handles.size && inserted) {
      const ids: string[] = [];
      allProfiles.forEach((p) => {
        const handle = (p.full_name || "").toLowerCase().replace(/\s+/g, "");
        if (handles.has(handle)) ids.push(p.id);
      });
      if (ids.length) {
        await supabase
          .from("chat_mentions")
          .insert(ids.map((mid) => ({ message_id: inserted.id, mentioned_user_id: mid })));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="font-serif text-lg font-semibold">Thread</div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="text-sm font-semibold">{profiles[parent.user_id]?.full_name || "Member"}</div>
            {parent.body && <MessageBody body={parent.body} />}
            {parent.attachment_url && (
              <Attachment url={parent.attachment_url} type={parent.attachment_type ?? ""} name={parent.attachment_name ?? "file"} />
            )}
          </div>
          {replies.map((r) => {
            const author = profiles[r.user_id]?.full_name || "Member";
            const rxs = reactions.filter((x) => x.message_id === r.id);
            const grouped: Record<string, Reaction[]> = {};
            rxs.forEach((x) => (grouped[x.emoji] ||= []).push(x));
            return (
              <div key={r.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {author.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{author}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {(r.user_id === currentUserId || isLeader) && (
                      <button
                        onClick={() => supabase.from("chat_messages").delete().eq("id", r.id)}
                        className="ml-auto opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  {r.body && <MessageBody body={r.body} />}
                  {r.attachment_url && (
                    <Attachment url={r.attachment_url} type={r.attachment_type ?? ""} name={r.attachment_name ?? "file"} />
                  )}
                  {Object.keys(grouped).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(grouped).map(([emoji, list]) => (
                        <span key={emoji} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs">
                          {emoji} {list.length}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={submit} className="border-t border-border p-3">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply in thread…"
              maxLength={2000}
            />
            <Button type="submit" disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewChannelDialogImpl({
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

function ChannelButton({
  channel, active, count, onClick,
}: {
  channel: Channel;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition ${
          active ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-secondary"
        }`}
      >
        {channel.leader_only ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
        <span className="flex-1 truncate text-left">{channel.name}</span>
        {count > 0 && !active && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </li>
  );
}
