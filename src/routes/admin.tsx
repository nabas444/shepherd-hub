import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Calendar, MessageCircle, BookOpen, HandHeart, Shield,
  Search, Sparkles, TrendingUp, History, ShieldCheck, Check, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Shepherd Hub" }] }),
  component: AdminPage,
});

type AppRole = "admin" | "leader" | "member";

interface MemberRow {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  join_date: string;
  last_activity_date: string | null;
  ministry: string | null;
}

interface RoleRow { user_id: string; role: AppRole }

interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  details: { role?: string } | null;
  created_at: string;
}

interface LeaderRequest {
  id: string;
  user_id: string;
  reason: string | null;
  ministry: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface Counts {
  members: number;
  newMembers: number;
  active: number;
  events: number;
  upcomingEvents: number;
  messages: number;
  devotionals: number;
  mentorships: number;
  activeMentorships: number;
}

function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [counts, setCounts] = useState<Counts>({
    members: 0, newMembers: 0, active: 0,
    events: 0, upcomingEvents: 0,
    messages: 0, devotionals: 0,
    mentorships: 0, activeMentorships: 0,
  });
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, AppRole[]>>({});
  const [query, setQuery] = useState("");
  const [recentSignups, setRecentSignups] = useState<MemberRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [leaderRequests, setLeaderRequests] = useState<LeaderRequest[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!loading && user && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, user, isAdmin, navigate]);

  const load = async () => {
    setBusy(true);
    const todayIso = new Date().toISOString();
    const [
      profilesRes, rolesRes, eventsRes, upcomingRes, msgsRes, devsRes, mentRes, activeMentRes, recentRes,
      auditRes, leaderReqRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, status, join_date, last_activity_date, ministry"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("events").select("id", { count: "exact", head: true }).gte("starts_at", todayIso),
      supabase.from("chat_messages").select("id", { count: "exact", head: true }),
      supabase.from("devotionals").select("id", { count: "exact", head: true }),
      supabase.from("mentorships").select("id", { count: "exact", head: true }),
      supabase.from("mentorships").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("profiles").select("id, full_name, email, status, join_date, last_activity_date, ministry").order("join_date", { ascending: false }).limit(5),
      supabase.from("audit_log").select("id, actor_id, action, target_user_id, details, created_at").order("created_at", { ascending: false }).limit(15),
      supabase.from("leader_requests").select("id, user_id, reason, ministry, status, created_at").order("created_at", { ascending: false }),
    ]);

    const allMembers = (profilesRes.data ?? []) as MemberRow[];
    setMembers(allMembers);
    setRecentSignups((recentRes.data ?? []) as MemberRow[]);
    setAudit((auditRes.data ?? []) as AuditEntry[]);
    setLeaderRequests((leaderReqRes.data ?? []) as LeaderRequest[]);

    const byUser: Record<string, AppRole[]> = {};
    ((rolesRes.data ?? []) as RoleRow[]).forEach((r) => {
      byUser[r.user_id] = [...(byUser[r.user_id] ?? []), r.role];
    });
    setRolesByUser(byUser);

    setCounts({
      members: allMembers.length,
      newMembers: allMembers.filter((m) => m.status === "new").length,
      active: allMembers.filter((m) => m.status === "active").length,
      events: eventsRes.count ?? 0,
      upcomingEvents: upcomingRes.count ?? 0,
      messages: msgsRes.count ?? 0,
      devotionals: devsRes.count ?? 0,
      mentorships: mentRes.count ?? 0,
      activeMentorships: activeMentRes.count ?? 0,
    });
    setBusy(false);
  };

  useEffect(() => { if (user && isAdmin) load(); }, [user, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.full_name.toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q) ||
      (m.ministry ?? "").toLowerCase().includes(q)
    );
  }, [members, query]);

  const setUserRole = async (userId: string, role: AppRole) => {
    // Remove existing roles for this user, set new single role.
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) { toast.error(delErr.message); return; }
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (insErr) { toast.error(insErr.message); return; }
    setRolesByUser((prev) => ({ ...prev, [userId]: [role] }));
    toast.success(`Role updated to ${role}`);
  };

  const reviewLeaderRequest = async (req: LeaderRequest, decision: "approved" | "rejected") => {
    const { error } = await supabase
      .from("leader_requests")
      .update({ status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) return toast.error(error.message);

    if (decision === "approved") {
      // Promote the user to leader (replaces existing roles for this user)
      await supabase.from("user_roles").delete().eq("user_id", req.user_id);
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: req.user_id, role: "leader" });
      if (insErr) return toast.error(insErr.message);
      setRolesByUser((prev) => ({ ...prev, [req.user_id]: ["leader"] }));
    }

    setLeaderRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: decision } : r)));
    toast.success(`Request ${decision}`);
  };

  if (loading || !user || !isAdmin) return <PageLoader />;

  // Engagement %: active / total
  const engagement = counts.members ? Math.round((counts.active / counts.members) * 100) : 0;

  // Ministry breakdown
  const ministryBreakdown = members.reduce<Record<string, number>>((acc, m) => {
    const k = (m.ministry ?? "Unassigned").trim() || "Unassigned";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const ministryEntries = Object.entries(ministryBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxMinistry = Math.max(1, ...ministryEntries.map(([, v]) => v));

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-10 animate-fade-in">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Shield className="h-3.5 w-3.5" /> Admin
          </div>
          <h1 className="mt-3 text-4xl font-serif text-foreground md:text-5xl">Shepherd's view</h1>
          <p className="mt-2 text-muted-foreground">Analytics, engagement, and role management.</p>
        </header>

        {/* KPI grid */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Members" value={counts.members} sub={`${counts.newMembers} new`} icon={Users} />
          <Stat label="Engagement" value={`${engagement}%`} sub={`${counts.active} active`} icon={TrendingUp} accent />
          <Stat label="Upcoming events" value={counts.upcomingEvents} sub={`${counts.events} total`} icon={Calendar} />
          <Stat label="Active mentorships" value={counts.activeMentorships} sub={`${counts.mentorships} total`} icon={HandHeart} />
          <Stat label="Messages" value={counts.messages} icon={MessageCircle} />
          <Stat label="Devotionals" value={counts.devotionals} icon={BookOpen} />
          <Stat label="New this season" value={counts.newMembers} icon={Sparkles} accent />
          <Stat label="Active members" value={counts.active} icon={Users} />
        </section>

        {/* Ministry breakdown + recent signups */}
        <section className="mb-10 grid gap-5 lg:grid-cols-[1.2fr,1fr]">
          <Card title="Ministry distribution">
            {busy ? (
              <SkeletonRows />
            ) : ministryEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ul className="space-y-3">
                {ministryEntries.map(([name, n]) => (
                  <li key={name}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium text-foreground">{name}</span>
                      <span className="text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(n / maxMinistry) * 100}%`, background: "var(--gradient-primary)" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent signups">
            {busy ? (
              <SkeletonRows />
            ) : recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signups yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentSignups.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{m.full_name || m.email || "Member"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.email || "—"} · {new Date(m.join_date).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      m.status === "new" ? "bg-gold/20 text-gold-foreground"
                      : m.status === "active" ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      {m.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Role management */}
        {leaderRequests.filter((r) => r.status === "pending").length > 0 && (
          <section
            className="mb-8 rounded-2xl border border-gold/40 bg-gold/5 p-6"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20 text-gold-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-semibold">Leader requests</h2>
                <p className="text-sm text-muted-foreground">Members applying for leader access.</p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {leaderRequests.filter((r) => r.status === "pending").map((r) => {
                const m = members.find((x) => x.id === r.user_id);
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{m?.full_name || m?.email || "Member"}</div>
                      <div className="text-xs text-muted-foreground">{m?.email}</div>
                      {r.ministry && (
                        <div className="mt-1 text-sm"><span className="text-muted-foreground">Ministry:</span> {r.ministry}</div>
                      )}
                      {r.reason && (
                        <p className="mt-1 max-w-prose text-sm text-foreground/80">"{r.reason}"</p>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">Submitted {new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => reviewLeaderRequest(r, "rejected")}>
                        <X className="mr-1 h-4 w-4" /> Decline
                      </Button>
                      <Button size="sm" onClick={() => reviewLeaderRequest(r, "approved")}>
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section
          className="rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl font-semibold">Members & roles</h2>
              <p className="text-sm text-muted-foreground">Assign admin, leader, or member roles.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, ministry…"
                className="pl-9"
              />
            </div>
          </div>

          {busy ? (
            <SkeletonRows count={6} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No members match" description="Try a different search." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Member</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Ministry</th>
                    <th className="py-2 pr-4 font-medium">Joined</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const roles = rolesByUser[m.id] ?? ["member"];
                    const top: AppRole = roles.includes("admin") ? "admin" : roles.includes("leader") ? "leader" : "member";
                    return (
                      <tr key={m.id} className="border-t border-border/60 transition-colors hover:bg-secondary/40">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">{m.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.email || "—"}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            m.status === "new" ? "bg-gold/20 text-gold-foreground"
                            : m.status === "active" ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                          }`}>{m.status}</span>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{m.ministry || "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{new Date(m.join_date).toLocaleDateString()}</td>
                        <td className="py-3 pr-4">
                          <Select
                            value={top}
                            onValueChange={(v) => setUserRole(m.id, v as AppRole)}
                            disabled={m.id === user.id}
                          >
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="leader">Leader</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">You can't change your own role.</p>
            </div>
          )}
        </section>

        {/* Audit log */}
        <section
          className="mt-8 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold">Recent activity</h2>
              <p className="text-sm text-muted-foreground">Role assignments and removals.</p>
            </div>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {audit.map((a) => {
                const actor = a.actor_id ? (members.find((m) => m.id === a.actor_id)?.full_name ?? "An admin") : "System";
                const target = a.target_user_id ? (members.find((m) => m.id === a.target_user_id)?.full_name ?? "a member") : "—";
                const verb = a.action === "role.assigned" ? "assigned" : "removed";
                const role = a.details?.role ?? "role";
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{actor}</span>{" "}
                      <span className="text-muted-foreground">{verb}</span>{" "}
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{role}</span>{" "}
                      <span className="text-muted-foreground">to</span>{" "}
                      <span className="font-medium text-foreground">{target}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, sub, icon: Icon, accent }: {
  label: string; value: number | string; sub?: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 hover-lift animate-fade-in"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          accent ? "bg-gold/20 text-gold-foreground" : "bg-primary/10 text-primary"
        }`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-3xl font-serif font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-6 animate-fade-in"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <h3 className="mb-4 font-serif text-lg font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary/60" />
      ))}
    </div>
  );
}
