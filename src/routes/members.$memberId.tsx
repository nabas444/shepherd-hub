import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { OnboardingJourney } from "@/components/OnboardingJourney";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Mail, Phone, Calendar, Sparkles } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  ministry: string | null;
  status: "new" | "active" | "inactive";
  onboarding_status: string;
  join_date: string;
  last_activity_date: string | null;
}

export const Route = createFileRoute("/members/$memberId")({
  head: () => ({ meta: [{ title: "Member Profile — Shepherd Hub" }] }),
  component: MemberProfilePage,
});

function MemberProfilePage() {
  const { memberId } = Route.useParams();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isOwner = user?.id === memberId;
  const canEdit = isOwner || isAdmin;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", memberId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setProfile(data as Profile | null);
        setLoading(false);
      });
  }, [user, memberId]);

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile || !canEdit) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const updates: Partial<Profile> = {
      full_name: String(fd.get("full_name") ?? ""),
      phone: String(fd.get("phone") ?? "") || null,
      ministry: String(fd.get("ministry") ?? "") || null,
    };
    // Only admins can change status
    if (isAdmin) {
      updates.status = fd.get("status") as Profile["status"];
    }
    const { error } = await supabase.from("profiles").update(updates).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    setProfile({ ...profile, ...updates } as Profile);
  };

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="container mx-auto px-6 py-10 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="container mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-serif">Member not found</h2>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/members"><ArrowLeft className="mr-2 h-4 w-4" />Back to members</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto max-w-3xl px-6 py-10">
        <Link to="/members" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> All members
        </Link>

        {/* Header card */}
        <div className="rounded-3xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-warm)" }}>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "var(--gradient-primary)" }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-serif font-semibold text-primary-foreground">
                  {(profile.full_name || profile.email || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-serif text-foreground">{profile.full_name || "Unnamed"}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {profile.email && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />{profile.email}</span>}
                {profile.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{profile.phone}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">{profile.status}</span>
                {profile.ministry && (
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{profile.ministry}</span>
                )}
                <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Joined {new Date(profile.join_date).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {profile.status === "new" && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-foreground" />
              <div>
                <p className="font-medium text-gold-foreground">New to the fellowship</p>
                <p className="mt-0.5 text-sm text-gold-foreground/80">
                  Welcome them warmly — onboarding status: <strong className="capitalize">{profile.onboarding_status}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Onboarding journey card */}
        <div
          className="mt-6 rounded-3xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-xl font-serif font-semibold">Onboarding journey</h2>
          </div>
          <OnboardingJourney userId={profile.id} />
        </div>

        {/* Edit form */}
        {canEdit && (
          <form onSubmit={handleSave} className="mt-6 rounded-3xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-soft)" }}>
            <h2 className="mb-5 text-xl font-serif font-semibold">{isOwner ? "Edit your profile" : "Edit member"}</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" defaultValue={profile.full_name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} placeholder="+1 555 123 4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ministry">Ministry / group</Label>
                <Input id="ministry" name="ministry" defaultValue={profile.ministry ?? ""} placeholder="Youth, Choir, Prayer..." />
              </div>
              {isAdmin && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="status">Status (admin)</Label>
                  <Select name="status" defaultValue={profile.status}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            </div>
          </form>
        )}

        {!canEdit && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Only the member or an admin can edit this profile.
          </p>
        )}
      </div>
    </AppShell>
  );
}
