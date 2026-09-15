import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: transport/CSRF hardening only.
 *
 * Deliberately does NOT do authorization. Next.js middleware is not a reliable
 * security boundary, and Prisma cannot run on the edge runtime — every real
 * access decision is made server-side in `src/lib/guards.ts`, against the
 * database, at the point of use.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  // Non-browser callers (and some same-origin form posts) send no Origin at
  // all; fall back to Sec-Fetch-Site, which browsers always send.
  if (!origin) {
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
  }

  try {
    const originHost = new URL(origin).host;
    const expectedHost =
      request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
    return originHost === expectedHost;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // CSRF: reject cross-site state-changing requests before they reach a handler.
  // Session cookies are SameSite=Lax, so this is defence in depth.
  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // Force HTTPS for a year once the site has been served over TLS.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's static output and the favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
