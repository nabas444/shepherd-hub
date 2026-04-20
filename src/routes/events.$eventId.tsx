import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, MapPin, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId")({
  head: () => ({ meta: [{ title: "Event — Shepherd Hub" }] }),
  component: EventDetail,
});

type RsvpStatus = "going" | "maybe" | "declined";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  created_by: string;
}

interface AttendeeRow {
  user_id: string;
  status: RsvpStatus;
  profile: { full_name: string; avatar_url: string | null } | null;
}

function EventDetail() {
  const { eventId } = Route.useParams();
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [busy, setBusy] = useState(true);

  const canManage = roles.includes("leader") || roles.includes("admin");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    setBusy(true);
    const { data: e } = await supabase
      .from("events")
      .select("id,title,description,location,starts_at,ends_at,capacity,created_by")
      .eq("id", eventId)
      .maybeSingle();
    setEvent(e ?? null);

    const { data: rsvps } = await supabase
      .from("event_rsvps")
      .select("user_id,status")
      .eq("event_id", eventId);

    const userIds = (rsvps ?? []).map((r) => r.user_id);
    let profiles: Array<{ id: string; full_name: string; avatar_url: string | null }> = [];
    if (userIds.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", userIds);
      profiles = ps ?? [];
    }
    const merged: AttendeeRow[] = (rsvps ?? []).map((r) => ({
      user_id: r.user_id,
      status: r.status as RsvpStatus,
      profile: profiles.find((p) => p.id === r.user_id) ?? null,
    }));
    setAttendees(merged);
    if (user) {
      const mine = merged.find((m) => m.user_id === user.id);
      setMyStatus(mine?.status ?? null);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, eventId]);

  const setRsvp = async (status: RsvpStatus) => {
    if (!user) return;
    const { error } = await supabase
      .from("event_rsvps")
      .upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: "event_id,user_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`RSVP saved: ${status}`);
    load();
  };

  const clearRsvp = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMyStatus(null);
    load();
  };

  const deleteEvent = async () => {
    if (!confirm("Delete this event?")) return;
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event deleted");
    navigate({ to: "/events" });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const going = attendees.filter((a) => a.status === "going");
  const maybe = attendees.filter((a) => a.status === "maybe");

  return (
    <AppShell>
      <div className="container mx-auto max-w-4xl px-6 py-10">
        <Link
          to="/events"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to gatherings
        </Link>

        {busy || !event ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <>
            <div
              className="rounded-2xl border border-border bg-card p-8"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-serif text-3xl md:text-4xl">{event.title}</h1>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      {new Date(event.starts_at).toLocaleString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-primary" /> {event.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-primary" /> {going.length} going
                      {event.capacity && ` / ${event.capacity}`}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={deleteEvent}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {event.description && (
                <p className="mt-6 whitespace-pre-wrap text-foreground/90">{event.description}</p>
              )}

              <div className="mt-8 border-t border-border pt-6">
                <div className="mb-3 text-sm font-medium text-muted-foreground">
                  Will you join us?
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["going", "maybe", "declined"] as const).map((s) => (
                    <Button
                      key={s}
                      variant={myStatus === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRsvp(s)}
                      className="capitalize"
                    >
                      {s}
                    </Button>
                  ))}
                  {myStatus && (
                    <Button variant="ghost" size="sm" onClick={clearRsvp}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <AttendeeList title="Going" rows={going} />
              <AttendeeList title="Maybe" rows={maybe} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AttendeeList({ title, rows }: { title: string; rows: AttendeeRow[] }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <h3 className="mb-4 font-serif text-lg font-semibold">
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.user_id} className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {(r.profile?.full_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <Link
                to="/members/$memberId"
                params={{ memberId: r.user_id }}
                className="hover:text-primary"
              >
                {r.profile?.full_name || "Unnamed member"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
