import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarIcon, MapPin, Users, Plus, Sparkles, ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Events — Shepherd Hub" }] }),
  component: EventsPage,
});

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  image_url: string | null;
}

function EventsPage() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const canCreate = roles.includes("leader") || roles.includes("admin");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    setBusy(true);
    const ascending = view === "calendar" ? true : filter === "upcoming";
    const { data } = await supabase
      .from("events")
      .select("id,title,description,location,starts_at,ends_at,capacity,image_url")
      .order("starts_at", { ascending });
    setEvents(data ?? []);
    const ids = (data ?? []).map((e) => e.id);
    if (ids.length) {
      const { data: rsvps } = await supabase
        .from("event_rsvps")
        .select("event_id")
        .eq("status", "going")
        .in("event_id", ids);
      const map: Record<string, number> = {};
      (rsvps ?? []).forEach((r) => {
        map[r.event_id] = (map[r.event_id] ?? 0) + 1;
      });
      setCounts(map);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter, view]);

  const now = new Date().toISOString();
  const visible = events.filter((e) =>
    filter === "upcoming" ? e.starts_at >= now : e.starts_at < now,
  );

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-serif text-foreground md:text-5xl">Gatherings</h1>
            <p className="mt-2 text-muted-foreground">Come together, break bread, and grow.</p>
          </div>
          {canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" /> New event
                </Button>
              </DialogTrigger>
              <CreateEventDialog
                userId={user.id}
                onClose={() => setOpen(false)}
                onCreated={load}
              />
            </Dialog>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["list", "calendar"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "list" ? <List className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                {v}
              </button>
            ))}
          </div>
          {view === "list" && (
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              {(["upcoming", "past"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                    filter === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>

        {busy ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : view === "calendar" ? (
          <CalendarView events={events} cursor={cursor} setCursor={setCursor} />
        ) : visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((e) => (
              <EventCard key={e.id} event={e} goingCount={counts[e.id] ?? 0} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EventCard({ event, goingCount }: { event: EventRow; goingCount: number }) {
  const date = new Date(event.starts_at);
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="block rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CalendarIcon className="h-5 w-5" />
      </div>
      <h3 className="font-serif text-lg font-semibold leading-tight">{event.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}{" "}
        ·{" "}
        {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </p>
      {event.location && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {event.location}
        </p>
      )}
      <div className="mt-4 flex items-center gap-1.5 text-sm text-foreground/80">
        <Users className="h-4 w-4 text-primary" />
        <span className="font-medium">{goingCount}</span>
        <span className="text-muted-foreground">going</span>
        {event.capacity && (
          <span className="text-muted-foreground">· cap {event.capacity}</span>
        )}
      </div>
    </Link>
  );
}

function EmptyState({ filter }: { filter: "upcoming" | "past" }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-xl">
        {filter === "upcoming" ? "No gatherings on the horizon" : "No past events yet"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {filter === "upcoming"
          ? "When leaders schedule events, they'll appear here."
          : "Past gatherings will be remembered here."}
      </p>
    </div>
  );
}

function CreateEventDialog({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startsAt) {
      toast.error("Title and start time are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("events").insert({
      title,
      description: description || null,
      location: location || null,
      starts_at: new Date(startsAt).toISOString(),
      capacity: capacity ? Number(capacity) : null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event created");
    onCreated();
    onClose();
    setTitle("");
    setDescription("");
    setLocation("");
    setStartsAt("");
    setCapacity("");
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl">Plan a gathering</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday service" />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div>
          <label className="text-sm font-medium">Location</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main hall" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Starts at</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Capacity</label>
            <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create event"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CalendarView({
  events,
  cursor,
  setCursor,
}: {
  events: EventRow[];
  cursor: Date;
  setCursor: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build 6-week grid (42 cells)
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(year, month, i - startWeekday + 1);
    cells.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }

  // Group events by yyyy-mm-dd
  const byDay: Record<string, EventRow[]> = {};
  events.forEach((e) => {
    const d = new Date(e.starts_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    (byDay[key] ||= []).push(e);
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const [selected, setSelected] = useState<string | null>(todayKey);
  const selectedEvents = selected ? byDay[selected] ?? [] : [];
  const selectedDate = selected
    ? cells.find((c) => `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}` === selected)?.date
    : null;

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelected(todayKey);
  };

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div
        className="rounded-2xl border border-border bg-card p-5"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{monthLabel}</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goNext} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {weekdays.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            const key = `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`;
            const dayEvents = byDay[key] ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={i}
                onClick={() => setSelected(key)}
                className={`group flex min-h-[84px] flex-col rounded-lg border p-1.5 text-left transition ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/50 hover:border-border hover:bg-secondary/40"
                } ${c.inMonth ? "" : "opacity-40"}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {c.date.getDate()}
                </span>
                <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                      title={e.title}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside
        className="rounded-2xl border border-border bg-card p-5"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Selected day
          </p>
          <h3 className="font-serif text-xl">
            {selectedDate
              ? selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Pick a day"}
          </h3>
        </div>
        {selectedEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
            <CalendarIcon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No gatherings this day.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {selectedEvents
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((e) => {
                const d = new Date(e.starts_at);
                return (
                  <li key={e.id}>
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: e.id }}
                      className="block rounded-xl border border-border bg-background p-3 transition hover:-translate-y-0.5 hover:border-primary/50"
                    >
                      <p className="font-serif text-base font-semibold leading-tight">
                        {e.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {e.location && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {e.location}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </aside>
    </div>
  );
}
