import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Heart, LogOut, Users, Calendar, BookOpen, MessageCircle, BarChart3, HandHeart } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Shepherd Hub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading, signOut, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const upcoming = [
    { icon: Users, title: "Members", desc: "Manage your fellowship", soon: false },
    { icon: BarChart3, title: "Engagement", desc: "Insights & analytics", soon: true },
    { icon: Calendar, title: "Events", desc: "Plan & RSVP", soon: true },
    { icon: BookOpen, title: "Devotionals", desc: "Daily Word", soon: true },
    { icon: MessageCircle, title: "Community Chat", desc: "Real-time groups", soon: true },
    { icon: HandHeart, title: "Mentorship", desc: "Pair & nurture", soon: true },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-warm)" }}>
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Heart className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-serif font-semibold">Shepherd Hub</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email} {roles.length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{roles[0]}</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-serif text-foreground md:text-5xl">Peace be with you</h1>
          <p className="mt-2 text-muted-foreground">Your fellowship dashboard. More modules coming soon.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((m) => (
            <div
              key={m.title}
              className="rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <m.icon className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-serif font-semibold">{m.title}</h3>
                {m.soon && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                    Soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
