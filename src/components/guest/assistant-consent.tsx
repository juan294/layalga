"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  continueAssistantConsent,
  decideAssistantAccess,
} from "@/app/[locale]/oauth/consent/actions";
import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import type { AppLocale } from "@/i18n/routing";
import type { ConsentState } from "@/lib/auth/assistant-consent";
import { assistantConsentPath } from "@/lib/auth/safe-next-path";

import { useHydrated } from "../use-hydrated";
import { ASSISTANTS } from "./assistant-names";
import styles from "./assistants.module.css";
import ledger from "./guest-ledger.module.css";

const NAMED_SCOPES = ["email", "profile", "phone"] as const;

export function AssistantConsent({
  locale,
  authorizationId,
  initial,
  authFailed,
}: {
  locale: AppLocale;
  authorizationId: string;
  initial: ConsentState;
  authFailed: boolean;
}) {
  const t = useTranslations("Assistants");
  const hydrated = useHydrated();
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const path = assistantConsentPath(locale, authorizationId);
  const idle = hydrated && !pending;

  // The next step replaces the focused button.
  useEffect(() => {
    if (state !== initial) heading.current?.focus();
  }, [state, initial]);

  function run(action: () => Promise<ConsentState>) {
    start(async () => {
      const next = await action().catch((): ConsentState => ({
        status: "unavailable",
      }));
      setState(next);
      if (next.status === "redirect") window.location.assign(next.url);
    });
  }

  const name = "assistant" in state ? ASSISTANTS[state.assistant].name : "";
  const title = (
    <h2 className={styles.stateTitle} ref={heading} tabIndex={-1}>
      {t(`states.${state.status}.title`, { assistant: name })}
    </h2>
  );

  function signIn(label: string) {
    return (
      <SignInButton
        locale={locale}
        nextPath={path}
        label={label}
        className={ledger.secondaryButton}
        disabled={pending}
      />
    );
  }

  if (state.status === "review") {
    const vendor = ASSISTANTS[state.assistant].vendor;
    return (
      <section className={styles.stack}>
        {title}
        <dl className={ledger.factList}>
          <dt>{t("assistant")}</dt>
          <dd>{name}</dd>
          <dt>{t("answersGoTo")}</dt>
          <dd>{state.domain}</dd>
          <dt>{t("account")}</dt>
          <dd>{state.email}</dd>
        </dl>
        <Facts
          title={t("canRead")}
          items={[
            t("readHouseholds"),
            t("readDates"),
            t("readRooms"),
            t("readStatus"),
          ]}
        />
        <Facts title={t("cannot")} items={[t("cannotSend")]} />
        {state.scopes.length > 0 && (
          <Facts
            title={t("alsoAsks")}
            items={state.scopes.map((scope) => {
              const named = NAMED_SCOPES.find((known) => known === scope);
              return named ? t(`scope.${named}`) : t("scope.other", { scope });
            })}
          />
        )}
        <p className={ledger.notice}>{t("vendorReads", { vendor })}</p>
        <div>
          <p className={styles.line}>
            {t("signOutKeeps", { assistant: name })}
          </p>
          <Link className={styles.actionLink} href={`/${locale}/assistants`}>
            {t("manage")}
          </Link>
        </div>
        <div aria-busy={pending}>
          <div className={styles.decision}>
            {(["allow", "deny"] as const).map((decision) => (
              <button
                key={decision}
                type="button"
                className={ledger.secondaryButton}
                data-testid={`assistant-${decision}`}
                disabled={!idle}
                onClick={() =>
                  run(() => decideAssistantAccess(authorizationId, decision))
                }
              >
                {t(decision)}
              </button>
            ))}
          </div>
          <p role="status">{pending ? t("answering") : null}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.stack}>
      {title}
      {authFailed && state === initial && <p role="alert">{t("authFailed")}</p>}
      {state.status === "start" && state !== initial && (
        <p role="alert">{t("accountChanged")}</p>
      )}
      {"email" in state && (
        <dl className={ledger.factList}>
          <dt>{t("account")}</dt>
          <dd>{state.email}</dd>
        </dl>
      )}
      <p className={state.status === "start" ? ledger.notice : undefined}>
        {t(`states.${state.status}.body`)}
      </p>
      {nextAction()}
    </section>
  );

  function nextAction() {
    switch (state.status) {
      case "start":
        return (
          <div className={styles.decision}>
            <button
              type="button"
              className={ledger.primaryButton}
              data-testid="assistant-continue"
              disabled={!idle}
              onClick={() =>
                run(() =>
                  continueAssistantConsent(authorizationId, state.email),
                )
              }
            >
              {pending ? t("checking") : t("continue")}
            </button>
            {signIn(t("useAnother"))}
          </div>
        );
      case "continue":
      case "redirect":
        return (
          <a
            className={styles.actionLink}
            data-testid="assistant-link"
            href={state.url}
            rel="noreferrer"
          >
            {t(state.status === "continue" ? "goTo" : "returnTo", {
              assistant: name,
            })}
          </a>
        );
      case "off":
        return (
          <Link className={styles.actionLink} href={`/${locale}/assistants`}>
            {t("manage")}
          </Link>
        );
      case "not_allowed":
        return (
          <Link className={styles.actionLink} href={`/${locale}/stays`}>
            {t("findStay")}
          </Link>
        );
      case "unavailable":
        // A full load: the session and the request are checked again.
        return (
          <a className={styles.actionLink} href={path}>
            {t("retry")}
          </a>
        );
      case "sign_in":
        return signIn(t("signIn"));
      case "host":
        return signIn(t("useAnother"));
      default:
        return null;
    }
  }
}

function Facts({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className={styles.factTitle}>{title}</h3>
      <ul className={styles.plainList}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
