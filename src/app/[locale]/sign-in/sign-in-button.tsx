"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AppLocale } from "@/i18n/routing";

export function SignInButton({
  locale,
  nextPath = `/${locale}`,
  label,
  className = "postcard__button postcard__button--primary",
}: {
  locale: AppLocale;
  nextPath?: string;
  label?: string;
  className?: string;
}) {
  const t = useTranslations("SignIn");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(false);
    setPending(true);
    try {
      const preparation = await fetch("/auth/prepare", {
        body: JSON.stringify({ next: nextPath }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!preparation.ok) throw new Error("OAuth preparation failed");

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) throw authError;
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <>
      <button
        className={className}
        type="button"
        onClick={signIn}
        disabled={pending}
      >
        {pending ? t("connecting") : (label ?? t("googleAction"))}
      </button>
      {error ? (
        <p className="postcard__error" role="alert">
          {t("startError")}
        </p>
      ) : null}
    </>
  );
}
