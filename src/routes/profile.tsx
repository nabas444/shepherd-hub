import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Your profile — Shepherd Hub" }] }),
  component: ProfilePage,
});

interface ProfileData {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ministry: string | null;
  avatar_url: string | null;
}

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, ministry, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as ProfileData));
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profile.full_name,
        phone: profile.phone,
        ministry: profile.ministry,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Max 4MB");
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);
    setUploading(false);
    if (updErr) return toast.error(updErr.message);
    setProfile({ ...profile, avatar_url: url });
    toast.success("Avatar updated");
  };

  if (loading || !user || !profile) return <PageLoader />;

  const initials = (profile.full_name || profile.email || "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell>
      <div className="container mx-auto max-w-2xl px-6 py-10 animate-fade-in">
        <header className="mb-8">
          <h1 className="text-4xl font-serif text-foreground md:text-5xl">Your profile</h1>
          <p className="mt-2 text-muted-foreground">Tell the fellowship who you are.</p>
        </header>

        <div
          className="rounded-2xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="mb-8 flex items-center gap-5">
            <div className="relative">
              <Avatar className="h-24 w-24 ring-4 ring-primary/10">
                {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
                <AvatarFallback className="bg-primary/10 text-xl font-serif text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:scale-105 disabled:opacity-60"
                aria-label="Upload avatar"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={onFile}
              />
            </div>
            <div>
              <div className="font-serif text-xl font-semibold">{profile.full_name || "—"}</div>
              <div className="text-sm text-muted-foreground">{profile.email}</div>
              {uploading && <div className="text-xs text-primary">Uploading…</div>}
            </div>
          </div>

          <form onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={profile.full_name ?? ""}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone ?? ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="(optional)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ministry">Ministry / group</Label>
                <Input
                  id="ministry"
                  value={profile.ministry ?? ""}
                  onChange={(e) => setProfile({ ...profile, ministry: e.target.value })}
                  placeholder="e.g. Worship, Youth"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}