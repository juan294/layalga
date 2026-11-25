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

import { useHydrated } from "../use-hydrated";
import { ASSISTANTS } from "./assistant-names";
import styles from "./guest-ledger.module.css";

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
  const path = `/${locale}/oauth/consent?authorization_id=${authorizationId}`;
  const idle = hydrated && !pending;

  // The next step replaces the focused button.
  useEffect(() => {
    if (state !== initial) heading.current?.focus();
  }, [state, initial]);

  function run(action: () => Promise<ConsentState>) {
    start(async () => {
      let next: ConsentState;
      try {
        next = await action();
      } catch {
        next = { status: "unavailable" };
      }
      setState(next);
      if (next.status === "redirect") window.location.assign(next.url);
    });
  }

  const assistant =
    "assistant" in state ? ASSISTANTS[state.assistant] : undefined;
  const name = assistant?.name ?? "";

  function title() {
    return (
      <h2 className={styles.stateTitle} ref={heading} tabIndex={-1}>
        {t(`states.${state.status}.title`, { assistant: name })}
      </h2>
    );
  }

  function signIn(label: string) {
    return (
      <SignInButton
        locale={locale}
        nextPath={path}
        label={label}
        className={styles.secondaryButton}
      />
    );
  }

  const failed = authFailed && state === initial && (
    <p role="alert">{t("authFailed")}</p>
  );

  if (state.status === "start")
    return (
      <section className={styles.assistantStack}>
        {title()}
        {failed}
        <dl className={styles.factList}>
          <dt>{t("account")}</dt>
          <dd>{state.email}</dd>
        </dl>
        <p className={styles.notice}>{t("states.start.body")}</p>
        <div className={styles.decision}>
          <button
            type="button"
            className={styles.primaryButton}
            data-testid="assistant-continue"
            disabled={!idle}
            onClick={() => run(() => continueAssistantConsent(authorizationId))}
          >
            {pending ? t("checking") : t("continue")}
          </button>
          {signIn(t("useAnother"))}
        </div>
      </section>
    );

  if (state.status === "review") {
    const vendor = ASSISTANTS[state.assistant].vendor;
    const decide = (decision: "allow" | "deny") =>
      run(() => decideAssistantAccess(authorizationId, decision));
    return (
      <section className={styles.assistantStack}>
        {title()}
        <dl className={styles.factList}>
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
        <p className={styles.notice}>{t("vendorReads", { vendor })}</p>
        <div>
          <p className={styles.assistantLine}>
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
                className={styles.secondaryButton}
                data-testid={`assistant-${decision}`}
                disabled={!idle}
                onClick={() => decide(decision)}
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
    <section className={styles.assistantStack}>
      {title()}
      {failed}
      <p>{t(`states.${state.status}.body`)}</p>
      <div>{nextAction()}</div>
    </section>
  );

  function nextAction() {
    switch (state.status) {
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
