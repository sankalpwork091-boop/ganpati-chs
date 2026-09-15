import { handlers } from "@/lib/auth";

// Prisma and bcrypt both need the Node runtime — not the edge runtime.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
