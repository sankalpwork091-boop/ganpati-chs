import "./load-env";

import { spawn } from "node:child_process";

import { getDatabaseUrl } from "../src/lib/getDatabaseUrl";

/**
 * Runs the Prisma CLI with a DATABASE_URL fetched from AWS Secrets Manager.
 *
 * The Prisma CLI reads the connection string from the environment, but we
 * deliberately never store it in .env — so this wrapper resolves it first and
 * passes it to the child process only.
 *
 *   npm run db:push      ->  prisma db push
 *   npm run db:migrate   ->  prisma migrate dev
 *   npm run db:studio    ->  prisma studio
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx scripts/prisma-cli.ts <prisma args...>");
    process.exit(1);
  }

  const databaseUrl = await getDatabaseUrl();

  const child = spawn("npx", ["prisma", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (error) => {
    console.error("Failed to start the Prisma CLI:", error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("Could not resolve the database connection:", error);
  process.exit(1);
});
