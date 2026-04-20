import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, UserCircle2, Mail, Phone } from "lucide-react";

type MemberStatus = "new" | "active" | "inactive" | "all";

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  ministry: string | null;
  status: "new" | "active" | "inactive";
  join_date: string;
}

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Members — Shepherd Hub" }] }),
  component: MembersPage,
});

const STATUS_STYLES: Record<string, string> = {
  new: "bg-gold/20 text-gold-foreground",
  active: "bg-primary/15 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

function MembersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberStatus>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, ministry, status, join_date")
      .order("join_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setMembers((data as Profile[]) ?? []);
        setFetching(false);
      });
  }, [user]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const matchesStatus = filter === "all" || m.status === filter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.full_name.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.ministry?.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [members, filter, search]);

  const counts = useMemo(() => ({
    all: members.length,
    new: members.filter((m) => m.status === "new").length,
    active: members.filter((m) => m.status === "active").length,
    inactive: members.filter((m) => m.status === "inactive").length,
  }), [members]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-serif text-foreground">Members</h1>
            <p className="mt-2 text-muted-foreground">Care for every soul in your fellowship.</p>
          </div>
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as MemberStatus)} className="mb-5">
          <TabsList>
            <TabsTrigger value="all">All <span className="ml-1.5 text-xs opacity-60">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="new">New <span className="ml-1.5 text-xs opacity-60">{counts.new}</span></TabsTrigger>
            <TabsTrigger value="active">Active <span className="ml-1.5 text-xs opacity-60">{counts.active}</span></TabsTrigger>
            <TabsTrigger value="inactive">Inactive <span className="ml-1.5 text-xs opacity-60">{counts.inactive}</span></TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, ministry…"
            className="pl-9"
          />
        </div>

        {/* List */}
        {fetching ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-card/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
            <UserCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-serif">No members found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? "Try a different search." : "Members will appear here as they join."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((m) => (
              <Link
                key={m.id}
                to="/members/$memberId"
                params={{ memberId: m.id }}
                className="group flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.full_name} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <span className="text-lg font-serif font-semibold">
                      {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-semibold text-foreground">
                      {m.full_name || "Unnamed member"}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status]}`}>
                      {m.status}
                    </span>
                    {m.ministry && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {m.ministry}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {m.email && (
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{m.email}</span>
                    )}
                    {m.phone && (
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{m.phone}</span>
                    )}
                  </div>
                </div>

                <Button variant="ghost" size="sm" className="opacity-0 transition-opacity group-hover:opacity-100">
                  View →
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
