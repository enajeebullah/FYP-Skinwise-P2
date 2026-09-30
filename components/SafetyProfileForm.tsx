"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SAFETY_FLAG_META, type SafetyFlags } from "@/lib/constants";

interface SafetyProfileFormProps {
  userId: string;
  initialFlags: SafetyFlags;
  isOnboarding?: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SafetyProfileForm({
  userId,
  initialFlags,
  isOnboarding = false,
}: SafetyProfileFormProps) {
  const router = useRouter();
  const [flags, setFlags] = useState<SafetyFlags>(initialFlags);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [skipping, setSkipping] = useState(false);

  function toggle(key: keyof SafetyFlags) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    setStatus("idle");
  }

  async function handleSave() {
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        safety_flags: flags,
        ...(isOnboarding ? { onboarding_completed: true } : {}),
      })
      .eq("id", userId);

    if (error) {
      console.error("Failed to save safety profile:", error.message);
      setStatus("error");
      return;
    }

    setStatus("saved");
    if (isOnboarding) {
      router.push("/");
      router.refresh();
    }
  }

  async function handleSkip() {
    setSkipping(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);

    if (error) {
      console.error("Failed to skip onboarding:", error.message);
      setSkipping(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8 space-y-4">
      {(Object.keys(SAFETY_FLAG_META) as (keyof SafetyFlags)[]).map((key) => {
        const meta = SAFETY_FLAG_META[key];
        return (
          <label
            key={key}
            className="flex items-start gap-3 rounded-xl border border-line p-4 cursor-pointer hover:bg-paper transition-colors"
          >
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={() => toggle(key)}
              className="mt-0.5 h-4 w-4 accent-ink"
            />
            <span className="text-sm text-ink">{meta.label}</span>
          </label>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          onClick={handleSave}
          disabled={status === "saving" || skipping}
          className="focus-ring rounded-full bg-ink text-paper px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : isOnboarding ? "Save & continue" : "Save safety profile"}
        </button>

        {isOnboarding && (
          <button
            onClick={handleSkip}
            disabled={skipping || status === "saving"}
            className="focus-ring text-sm text-muted hover:text-ink underline underline-offset-4 disabled:opacity-50"
          >
            {skipping ? "Skipping…" : "Skip & go to dashboard"}
          </button>
        )}

        {!isOnboarding && status === "saved" && (
          <span className="text-sm text-normal">✓ Saved</span>
        )}
        {status === "error" && <span className="text-sm text-red-600">Couldn&rsquo;t save — try again</span>}
      </div>

      {isOnboarding && (
        <p className="text-xs text-muted pt-1">
          You can always fill this in later from &ldquo;Safety Profile&rdquo; in the menu.
        </p>
      )}
    </div>
  );
}
