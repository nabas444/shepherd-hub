import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

interface Devotional {
  id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  body: string;
  publish_date: string;
}

export function DailyWordWidget() {
  const [item, setItem] = useState<Devotional | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("devotionals")
      .select("id,title,scripture_reference,scripture_text,body,publish_date")
      .lte("publish_date", today)
      .order("publish_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setItem(data as Devotional | null);
        setLoaded(true);
      });
  }, []);

  return (
    <Link
      to="/devotionals"
      className="block rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <h3 className="font-serif text-lg font-semibold">Today's Word</h3>
      </div>
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !item ? (
        <p className="text-sm text-muted-foreground">
          No devotional published yet. Leaders can post the Daily Word.
        </p>
      ) : (
        <>
          <h4 className="font-serif text-xl">{item.title}</h4>
          {item.scripture_text && (
            <p className="mt-2 line-clamp-3 font-serif italic text-foreground/80">
              "{item.scripture_text}"
            </p>
          )}
          {item.scripture_reference && (
            <p className="mt-1 text-sm font-medium text-primary">
              — {item.scripture_reference}
            </p>
          )}
          <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
            Read the reflection →
          </p>
        </>
      )}
    </Link>
  );
}
