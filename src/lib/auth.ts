import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Adapter } from "next-auth/adapters";
import type { MemberStatus, Role } from "@prisma/client";

import { recordAudit, requestContext } from "./audit";
import { prisma } from "./prisma";
import {
  checkLoginRateLimit,
  pruneOldLoginAttempts,
  recordLoginAttempt,
} from "./rateLimit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: MemberStatus;
      tcVersionAccepted: number | null;
      /** True when this session came from the admin credentials provider. */
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

/**
 * Session lifetime is deliberately short. Approval status is re-read from the
 * database in the `session` callback on every single call to `auth()`, so a
 * member approved by the admin is unlocked on their next request without
 * signing out and back in — the token never carries a stale status.
 */
const SESSION_MAX_AGE_SECONDS = 30 * 60;

/**
 * A plain `throw new Error(...)` inside `authorize()` is NOT surfaced to the
 * client — Auth.js only keeps the `code` off errors that are instances of its
 * own `CredentialsSignin`, and downgrades anything else to a generic
 * "Configuration" error with no code at all. Subclassing here is what lets the
 * client tell "wrong password" apart from "rate limited" (see
 * AdminLoginForm.tsx, which checks `result.code`).
 */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 5 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),

    Credentials({
      id: "admin-credentials",
      name: "Administrator",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const username = String(raw?.username ?? "").trim();
        const password = String(raw?.password ?? "");
        if (!username || !password) return null;

        const { ipAddress } = await requestContext();

        const limit = await checkLoginRateLimit(username, ipAddress);
        if (!limit.allowed) {
          await recordAudit({
            action: "LOGIN_FAILED",
            targetType: "admin",
            metadata: { username, reason: "rate_limited" },
          });
          throw new RateLimitedSignin();
        }

        const credential = await prisma.adminCredential.findUnique({
          where: { username: username.toLowerCase() },
          include: { user: true },
        });

        // Compare against a dummy hash when the username is unknown so that a
        // wrong username and a wrong password take the same time to answer.
        const hash =
          credential?.passwordHash ??
          "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const passwordMatches = await bcrypt.compare(password, hash);

        if (!credential || !passwordMatches || credential.user.role !== "ADMIN") {
          await recordLoginAttempt(username, ipAddress, false);
          await recordAudit({
            userId: credential?.userId,
            action: "LOGIN_FAILED",
            targetType: "admin",
            metadata: { username, reason: "bad_credentials" },
          });
          return null;
        }

        await recordLoginAttempt(username, ipAddress, true);
        void pruneOldLoginAttempts();

        await prisma.adminCredential.update({
          where: { id: credential.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: credential.user.id,
          email: credential.user.email,
          name: credential.user.name,
          image: credential.user.image,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Admin sign-ins are fully validated in `authorize` above.
      if (account?.provider !== "google") return true;

      // An admin account must never be reachable through Google OAuth.
      if (user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { role: true, status: true },
        });
        if (existing?.role === "ADMIN") return false;
        if (existing?.status === "REJECTED") return "/login?error=rejected";
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user?.id) token.uid = user.id;
      if (account?.provider === "admin-credentials") token.viaAdmin = true;
      return token;
    },

    /**
     * Runs on every `auth()` call. Role, status and T&C acceptance are read
     * fresh from the database here rather than being baked into the token —
     * this is what makes admin approval take effect immediately.
     */
    async session({ session, token }) {
      const userId = token.uid as string | undefined;
      if (!userId) return session;

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          status: true,
          tcVersionAccepted: true,
          adminCredential: { select: { passwordChangedAt: true } },
        },
      });

      if (!dbUser) {
        // The account was deleted while the token was still alive.
        return { ...session, user: undefined } as unknown as typeof session;
      }

      // A password reset invalidates every session issued before it, so a
      // session that's already out there (stolen, or just left open) can't
      // outlive the reset that was meant to shut it out.
      const passwordChangedAt = dbUser.adminCredential?.passwordChangedAt;
      if (
        passwordChangedAt &&
        typeof token.iat === "number" &&
        token.iat * 1000 < passwordChangedAt.getTime()
      ) {
        return { ...session, user: undefined } as unknown as typeof session;
      }

      session.user = {
        ...session.user,
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        role: dbUser.role,
        status: dbUser.status,
        tcVersionAccepted: dbUser.tcVersionAccepted,
        isAdmin: dbUser.role === "ADMIN" && token.viaAdmin === true,
      };

      return session;
    },
  },

  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) return;

      // Record the Google subject the first time we see it.
      if (account?.provider === "google" && account.providerAccountId) {
        await prisma.user
          .update({
            where: { id: user.id },
            data: { googleId: account.providerAccountId },
          })
          .catch(() => undefined);
      }

      await recordAudit({
        userId: user.id,
        action: "LOGIN",
        targetType: "user",
        targetId: user.id,
        metadata: { provider: account?.provider ?? "unknown", isNewUser: !!isNewUser },
      });
    },

    async signOut(message) {
      const userId =
        "token" in message ? (message.token?.uid as string | undefined) : undefined;
      if (!userId) return;
      await recordAudit({
        userId,
        action: "LOGOUT",
        targetType: "user",
        targetId: userId,
      });
    },
  },
});
