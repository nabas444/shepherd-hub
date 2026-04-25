import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Heart, User as UserIcon, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Shepherd Hub" },
      { name: "description", content: "Sign in or join Shepherd Hub to nurture your fellowship." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, refreshRoles } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [signupRole, setSignupRole] = useState<"member" | "leader">("member");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { data, error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: String(fd.get("full_name")) },
      },
    });
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }

    // If user chose to join as a leader, grant the leader role immediately
    // and update their profile with the ministry they'll lead.
    if (signupRole === "leader" && data.user) {
      const ministry = String(fd.get("leader_ministry") ?? "").trim();
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: "leader",
      });
      if (ministry) {
        await supabase.from("profiles").update({ ministry }).eq("id", data.user.id);
      }
      if (roleErr) {
        toast.error("Account created, but leader role failed: " + roleErr.message);
      } else {
        await refreshRoles();
        toast.success("Welcome, leader! You can now manage events and ministries.");
      }
    } else {
      toast.success("Welcome to Shepherd Hub!");
    }

    setSubmitting(false);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: "var(--gradient-warm)" }}>
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
            <Heart className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-serif font-semibold">Shepherd Hub</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-warm)" }}>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Join us</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-password">Password</Label>
                  <Input id="si-password" name="password" type="password" required autoComplete="current-password" minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Role intent selector */}
                <div className="space-y-2">
                  <Label>I'm joining as</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSignupRole("member")}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                        signupRole === "member"
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Member</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Join the fellowship</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole("leader")}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                        signupRole === "leader"
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Leader</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Request leader access</span>
                    </button>
                  </div>
                  {signupRole === "leader" && (
                    <p className="text-xs text-muted-foreground">
                      You'll get leader access right away — manage events, devotionals, and mentorships.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" name="full_name" type="text" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" name="password" type="password" required autoComplete="new-password" minLength={6} />
                </div>
                {signupRole === "leader" && (
                  <div className="space-y-2">
                    <Label htmlFor="su-ministry">Ministry / area you'll lead</Label>
                    <Input id="su-ministry" name="leader_ministry" placeholder="e.g. Worship, Youth, Prayer" />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Creating account…" : signupRole === "leader" ? "Create account as leader" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary">← Back home</Link>
        </p>
      </div>
    </div>
  );
}
