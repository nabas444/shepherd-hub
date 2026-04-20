import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { FollowUpWidget } from "@/components/FollowUpWidget";
import { OnboardingJourney } from "@/components/OnboardingJourney";
import { DailyWordWidget } from "@/components/DailyWordWidget";
import { Users, Calendar, BookOpen, MessageCircle, BarChart3, HandHeart, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Shepherd Hub" }] }),
  component: Dashboard,
});

interface Stats {
  total: number;
  newCount: number;
  active: number;
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, newCount: 0, active: 0 });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("status")
      .then(({ data }) => {
        const rows = data ?? [];
        setStats({
          total: rows.length,
          newCount: rows.filter((r) => r.status === "new").length,
          active: rows.filter((r) => r.status === "active").length,
        });
      });
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const modules = [
    { to: "/members", icon: Users, title: "Members", desc: "Manage your fellowship", live: true },
    { to: "/dashboard", icon: BarChart3, title: "Engagement", desc: "Insights & analytics", live: false },
    { to: "/events", icon: Calendar, title: "Events", desc: "Plan & RSVP", live: true },
    { to: "/devotionals", icon: BookOpen, title: "Devotionals", desc: "Daily Word", live: true },
    { to: "/dashboard", icon: MessageCircle, title: "Community Chat", desc: "Real-time groups", live: false },
    { to: "/dashboard", icon: HandHeart, title: "Mentorship", desc: "Pair & nurture", live: false },
  ] as const;

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-serif text-foreground md:text-5xl">Peace be with you</h1>
          <p className="mt-2 text-muted-foreground">Here's a glance at your fellowship today.</p>
        </div>

        {/* Stats */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total members" value={stats.total} icon={Users} />
          <StatCard label="New arrivals" value={stats.newCount} icon={Sparkles} accent />
          <StatCard label="Active" value={stats.active} icon={HandHeart} />
        </div>

        {/* Journey + Follow-up */}
        <div className="mb-10 grid gap-5 lg:grid-cols-2">
          <div
            className="rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="font-serif text-lg font-semibold">Your journey</h3>
            </div>
            <OnboardingJourney userId={user.id} />
          </div>
          <FollowUpWidget />
        </div>

        {/* Modules */}
        <h2 className="mb-4 text-xl font-serif text-foreground">Modules</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const card = (
              <div
                className={`rounded-2xl border border-border bg-card p-6 transition-all ${m.live ? "hover:-translate-y-1 cursor-pointer" : "opacity-60"}`}
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <m.icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-semibold">{m.title}</h3>
                  {!m.live && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                      Soon
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
              </div>
            );
            return m.live ? <Link key={m.title} to={m.to}>{card}</Link> : <div key={m.title}>{card}</div>;
          })}
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent ? "bg-gold/20 text-gold-foreground" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-4xl font-serif font-semibold text-foreground">{value}</div>
    </div>
  );
}
