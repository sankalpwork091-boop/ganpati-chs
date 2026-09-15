import { NextResponse } from "next/server";

import { apiError, requireApiViewer } from "@/lib/guards";
import { getActiveTermsVersion } from "@/lib/terms";

export const runtime = "nodejs";
// Approval status must never be served from a cache — this endpoint is the
// signal the waiting screen polls to know it can let the member through.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await requireApiViewer();
    const activeTerms = await getActiveTermsVersion();

    return NextResponse.json(
      {
        id: viewer.id,
        email: viewer.email,
        name: viewer.name,
        image: viewer.image,
        role: viewer.role,
        status: viewer.status,
        isAdmin: viewer.isAdmin,
        needsTerms: activeTerms
          ? viewer.tcVersionAccepted !== activeTerms.version
          : false,
        termsVersion: activeTerms?.version ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
