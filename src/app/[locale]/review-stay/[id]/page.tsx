import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import { RequestShell } from "@/components/guest/request-shell";
import { getCurrentHost } from "@/lib/auth/current-host";

export default async function ReviewStay({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if ((locale !== "en" && locale !== "es") || !z.uuid().safeParse(id).success)
    notFound();
  if (await getCurrentHost())
    redirect(`/${locale}#stay-request-${id.toLowerCase()}`);

  const t = await getTranslations({ locale, namespace: "StayRequests" });
  return (
    <RequestShell title={t("review")}>
      <SignInButton locale={locale} nextPath={`/${locale}/review-stay/${id}`} />
    </RequestShell>
  );
}
