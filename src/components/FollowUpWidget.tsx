import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ArrowRight } from "lucide-react";

interface FollowUp {
  id: string;
  full_name: string;
  email: string | null;
  join_date: string;
  completed: number;
  total: number;
}

export function FollowUpWidget() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Fetch new members + join their onboarding steps
      const { data: news } = await supabase
        .from("profiles")
        .select("id, full_name, email, join_date")
        .eq("status", "new")
        .order("join_date", { ascending: false })
        .limit(20);

      if (!news?.length) {
        setItems([]);
        setLoading(false);
        return;
      }

      const ids = news.map((n) => n.id);
      const { data: steps } = await supabase
        .from("onboarding_steps")
        .select("user_id, completed")
        .in("user_id", ids);

      const byUser = new Map<string, { completed: number; total: number }>();
      (steps ?? []).forEach((s: { user_id: string; completed: boolean }) => {
        const cur = byUser.get(s.user_id) ?? { completed: 0, total: 0 };
        cur.total++;
        if (s.completed) cur.completed++;
        byUser.set(s.user_id, cur);
      });

      const rows: FollowUp[] = news
        .map((n) => {
          const counts = byUser.get(n.id) ?? { completed: 0, total: 4 };
          return { ...n, ...counts } as FollowUp;
        })
        // needs follow-up = less than 50% complete
        .filter((r) => r.total === 0 || r.completed / r.total < 0.5)
        .slice(0, 5);

      setItems(rows);
      setLoading(false);
    })();
  }, []);

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20 text-gold-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="font-serif text-lg font-semibold">Needs follow-up</h3>
        </div>
        <Link to="/members" search={{}} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          🎉 Everyone is well on their way!
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => {
            const pct = m.total ? Math.round((m.completed / m.total) * 100) : 0;
            return (
              <li key={m.id}>
                <Link
                  to="/members/$memberId"
                  params={{ memberId: m.id }}
                  className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary/40"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-serif text-primary">
                    {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.full_name || m.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: "var(--gradient-gold)" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{m.completed}/{m.total}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
