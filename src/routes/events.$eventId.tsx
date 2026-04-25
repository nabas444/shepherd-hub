import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, MapPin, Users, Trash2, CreditCard, FileCheck, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/events/$eventId")({
  head: () => ({ meta: [{ title: "Event — Shepherd Hub" }] }),
  component: EventDetail,
});

type RsvpStatus = "going" | "maybe" | "declined";

interface RegField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "email" | "phone";
  required: boolean;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  created_by: string;
  requires_payment: boolean;
  payment_amount: number | null;
  payment_instructions: string | null;
  registration_fields: RegField[];
}

interface AttendeeRow {
  user_id: string;
  status: RsvpStatus;
  profile: { full_name: string; avatar_url: string | null } | null;
}

interface RegistrationRow {
  id: string;
  user_id: string;
  form_data: Record<string, string>;
  payment_proof_url: string | null;
  status: string;
  created_at: string;
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
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [myRegistration, setMyRegistration] = useState<RegistrationRow | null>(null);
  const [regOpen, setRegOpen] = useState(false);

  const canManage = roles.includes("leader") || roles.includes("admin");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    setBusy(true);
    const { data: e } = await supabase
      .from("events")
      .select("id,title,description,location,starts_at,ends_at,capacity,created_by,requires_payment,payment_amount,payment_instructions,registration_fields")
      .eq("id", eventId)
      .maybeSingle();
    setEvent(
      e
        ? {
            ...e,
            registration_fields: Array.isArray(e.registration_fields)
              ? (e.registration_fields as unknown as RegField[])
              : [],
          }
        : null,
    );

    const { data: rsvps } = await supabase
      .from("event_rsvps")
      .select("user_id,status")
      .eq("event_id", eventId);

    const { data: regs } = await supabase
      .from("event_registrations")
      .select("id,user_id,form_data,payment_proof_url,status,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    const userIds = Array.from(
      new Set([...(rsvps ?? []).map((r) => r.user_id), ...(regs ?? []).map((r) => r.user_id)]),
    );
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

    const mergedRegs: RegistrationRow[] = (regs ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      form_data: (r.form_data as Record<string, string>) ?? {},
      payment_proof_url: r.payment_proof_url,
      status: r.status,
      created_at: r.created_at,
      profile: profiles.find((p) => p.id === r.user_id) ?? null,
    }));
    setRegistrations(mergedRegs);

    if (user) {
      const mine = merged.find((m) => m.user_id === user.id);
      setMyStatus(mine?.status ?? null);
      setMyRegistration(mergedRegs.find((m) => m.user_id === user.id) ?? null);
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
  const hasRegistrationForm =
    !!event && (event.requires_payment || (event.registration_fields?.length ?? 0) > 0);

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

              {event.requires_payment && (
                <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <CreditCard className="h-4 w-4" />
                    Payment required: {event.payment_amount ?? "TBD"}
                  </div>
                  {event.payment_instructions && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
                      {event.payment_instructions}
                    </p>
                  )}
                </div>
              )}

              {hasRegistrationForm && (
                <div className="mt-6 border-t border-border pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">Registration</h3>
                      <p className="text-sm text-muted-foreground">
                        {myRegistration
                          ? "You have submitted your registration."
                          : "Fill the form to register for this event."}
                      </p>
                    </div>
                    <Button onClick={() => setRegOpen(true)} variant={myRegistration ? "outline" : "default"}>
                      {myRegistration ? (
                        <>
                          <FileCheck className="h-4 w-4" /> View / edit
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" /> Register
                        </>
                      )}
                    </Button>
                  </div>
                </div>
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

            {canManage && hasRegistrationForm && (
              <div className="mt-6">
                <RegistrationsAdminList registrations={registrations} fields={event.registration_fields ?? []} />
              </div>
            )}

            {hasRegistrationForm && event && (
              <RegistrationDialog
                open={regOpen}
                onClose={() => setRegOpen(false)}
                event={event}
                userId={user.id}
                existing={myRegistration}
                onSaved={load}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function RegistrationDialog({
  open,
  onClose,
  event,
  userId,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event: EventRow;
  userId: string;
  existing: RegistrationRow | null;
  onSaved: () => void;
}) {
  const fields = event.registration_fields ?? [];
  const [formData, setFormData] = useState<Record<string, string>>(existing?.form_data ?? {});
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [existingProof, setExistingProof] = useState<string | null>(existing?.payment_proof_url ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData(existing?.form_data ?? {});
    setExistingProof(existing?.payment_proof_url ?? null);
    setProofFile(null);
  }, [existing, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    for (const f of fields) {
      if (f.required && !formData[f.key]?.toString().trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    if (event.requires_payment && !proofFile && !existingProof) {
      toast.error("Please upload a screenshot of your payment evidence");
      return;
    }

    setSaving(true);
    let proofUrl = existingProof;
    if (proofFile) {
      const ext = proofFile.name.split(".").pop() || "png";
      const path = `${userId}/${event.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-registrations")
        .upload(path, proofFile, { upsert: true });
      if (upErr) {
        setSaving(false);
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("event-registrations").getPublicUrl(path);
      proofUrl = pub.publicUrl;
    }

    const { error } = await supabase
      .from("event_registrations")
      .upsert(
        {
          event_id: event.id,
          user_id: userId,
          form_data: formData,
          payment_proof_url: proofUrl,
          status: "submitted",
        },
        { onConflict: "event_id,user_id" },
      );
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    // Auto-RSVP "going"
    await supabase
      .from("event_rsvps")
      .upsert(
        { event_id: event.id, user_id: userId, status: "going" },
        { onConflict: "event_id,user_id" },
      );

    setSaving(false);
    toast.success("Registration submitted");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Register for {event.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium">
                {f.label}
                {f.required && <span className="ml-1 text-destructive">*</span>}
              </label>
              {f.type === "textarea" ? (
                <Textarea
                  rows={3}
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  type={
                    f.type === "number"
                      ? "number"
                      : f.type === "email"
                        ? "email"
                        : f.type === "phone"
                          ? "tel"
                          : "text"
                  }
                  value={formData[f.key] ?? ""}
                  onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {event.requires_payment && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <CreditCard className="h-4 w-4" />
                Amount: {event.payment_amount}
              </div>
              {event.payment_instructions && (
                <p className="mb-3 whitespace-pre-wrap text-sm text-foreground/80">
                  {event.payment_instructions}
                </p>
              )}
              <label className="text-sm font-medium">
                Payment evidence (screenshot)
                <span className="ml-1 text-destructive">*</span>
              </label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              {existingProof && !proofFile && (
                <a
                  href={existingProof}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View current upload
                </a>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : existing ? "Update registration" : "Submit registration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegistrationsAdminList({
  registrations,
  fields,
}: {
  registrations: RegistrationRow[];
  fields: RegField[];
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <h3 className="mb-4 font-serif text-lg font-semibold">
        Registrations <span className="text-muted-foreground">({registrations.length})</span>
      </h3>
      {registrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has registered yet.</p>
      ) : (
        <ul className="space-y-3">
          {registrations.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{r.profile?.full_name || "Unnamed member"}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {fields.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {fields.map((f) => (
                    <div key={f.key}>
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="font-medium">{r.form_data?.[f.key] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {r.payment_proof_url && (
                <a
                  href={r.payment_proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View payment evidence
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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
