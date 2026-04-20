import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import heroImage from "@/assets/hero-fellowship.jpg";
import { Heart, Users, Calendar, BookOpen, MessageCircle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shepherd Hub — Nurture Your Fellowship" },
      { name: "description", content: "All-in-one platform to shepherd members, plan events, share devotionals, and grow community." },
      { property: "og:title", content: "Shepherd Hub — Nurture Your Fellowship" },
      { property: "og:description", content: "All-in-one platform to shepherd members, plan events, share devotionals, and grow community." },
      { property: "og:image", content: heroImage },
      { name: "twitter:image", content: heroImage },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-warm)" }}>
      {/* Header */}
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
            <Heart className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-serif font-semibold text-foreground">Shepherd Hub</span>
        </div>
        <nav className="flex items-center gap-3">
          {user ? (
            <Button asChild>
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto grid items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="space-y-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-primary shadow-sm">
            <Sparkles className="h-3.5 w-3.5" /> Fellowship management, reimagined
          </span>
          <h1 className="text-5xl font-serif leading-[1.05] text-foreground md:text-6xl lg:text-7xl">
            Shepherd your <span className="italic" style={{ color: "var(--gold)" }}>flock</span> with care
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Welcome new members, track engagement, plan events, share devotionals, and build deep community — all in one peaceful place.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="text-base">
              <Link to="/auth">Begin your journey</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
        <div className="relative">
          <div
            className="absolute -inset-4 rounded-3xl opacity-60 blur-2xl"
            style={{ background: "var(--gradient-gold)" }}
          />
          <img
            src={heroImage}
            alt="Warm fellowship gathering"
            width={1536}
            height={1024}
            className="relative rounded-3xl shadow-2xl"
            style={{ boxShadow: "var(--shadow-warm)" }}
          />
        </div>
      </section>

      {/* Features preview */}
      <section className="container mx-auto px-6 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-serif text-foreground md:text-4xl">Everything your fellowship needs</h2>
          <p className="mt-3 text-muted-foreground">Built with the care of a shepherd, the warmth of a home.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Users, title: "Member Care", desc: "Track new arrivals, follow-ups, and the journey of every soul." },
            { icon: Calendar, title: "Events & RSVP", desc: "Plan gatherings and watch attendance at a glance." },
            { icon: BookOpen, title: "Daily Devotionals", desc: "Share the Word and verses of the day with your community." },
            { icon: MessageCircle, title: "Group Chat", desc: "Real-time conversations for youth, leaders, and ministries." },
            { icon: Sparkles, title: "Engagement Insights", desc: "See who's thriving and who needs a shepherd's call." },
            { icon: Heart, title: "Mentorship", desc: "Pair mentors and mentees, track their journey together." },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-serif font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container mx-auto px-6 py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Shepherd Hub · Built with care
      </footer>
    </div>
  );
}
