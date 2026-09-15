import { prisma } from "./prisma";

export interface ActiveTerms {
  id: string;
  version: number;
  title: string;
  body: string;
}

/**
 * The T&C text members must accept. Stored versioned in the database so the
 * committee can revise it later and we can still prove which wording each
 * member agreed to; bumping the active version re-prompts everyone.
 */
export async function getActiveTermsVersion(): Promise<ActiveTerms | null> {
  const terms = await prisma.termsVersion.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
    select: { id: true, version: true, title: true, body: true },
  });
  return terms;
}

export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const active = await getActiveTermsVersion();
  if (!active) return true; // Nothing published yet — don't block sign-in.

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tcVersionAccepted: true },
  });
  return user?.tcVersionAccepted === active.version;
}
