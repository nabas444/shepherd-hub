import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";

interface Step {
  id: string;
  step_key: string;
  step_label: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
}

interface JourneyProps {
  userId: string;
  onProgressChange?: (pct: number) => void;
}

export function OnboardingJourney({ userId, onProgressChange }: JourneyProps) {
  const { user, isLeader } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const isOwner = user?.id === userId;
  const canToggle = isOwner || isLeader;

  useEffect(() => {
    setLoading(true);
    supabase
      .from("onboarding_steps")
      .select("id, step_key, step_label, step_order, completed, completed_at")
      .eq("user_id", userId)
      .order("step_order")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        const rows = (data as Step[]) ?? [];
        setSteps(rows);
        setLoading(false);
        if (onProgressChange && rows.length) {
          const pct = Math.round((rows.filter((s) => s.completed).length / rows.length) * 100);
          onProgressChange(pct);
        }
      });
  }, [userId, onProgressChange]);

  const toggleStep = async (step: Step) => {
    if (!canToggle) return;
    const next = !step.completed;
    const optimistic = steps.map((s) =>
      s.id === step.id ? { ...s, completed: next, completed_at: next ? new Date().toISOString() : null } : s
    );
    setSteps(optimistic);
    if (onProgressChange) {
      const pct = Math.round((optimistic.filter((s) => s.completed).length / optimistic.length) * 100);
      onProgressChange(pct);
    }

    const { error } = await supabase
      .from("onboarding_steps")
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq("id", step.id);

    if (error) {
      toast.error(error.message);
      setSteps(steps); // revert
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.completed).length;
  const pct = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: "var(--gradient-gold)" }}
            />
          </div>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {completedCount}/{steps.length}
        </span>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => toggleStep(step)}
              disabled={!canToggle}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                step.completed
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
              } ${canToggle ? "cursor-pointer" : "cursor-default"}`}
            >
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                  step.completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {step.completed ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${step.completed ? "text-foreground" : "text-foreground/80"}`}>
                  {step.step_label}
                </div>
                {step.completed && step.completed_at && (
                  <div className="text-xs text-muted-foreground">
                    Completed {new Date(step.completed_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {!canToggle && (
        <p className="mt-3 text-xs text-muted-foreground">Only the member, leaders, or admins can mark steps.</p>
      )}
    </div>
  );
}
