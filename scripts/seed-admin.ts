import "./load-env";

import readline from "node:readline";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "../src/lib/getDatabaseUrl";

/**
 * Creates (or updates) an administrator account. There is no self-signup for
 * admins — this script is the only way one comes into existence.
 *
 *   npm run seed:admin
 *
 * Values may also be supplied non-interactively via ADMIN_USERNAME,
 * ADMIN_EMAIL and ADMIN_PASSWORD, which is useful for a one-off deploy shell.
 * The password is hashed with bcrypt and the plaintext is never stored.
 */

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Reads a line without echoing it to the terminal. */
function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const asMutable = rl as unknown as { _writeToOutput: (chunk: string) => void };
    const originalWrite = asMutable._writeToOutput.bind(rl);
    let muted = false;

    asMutable._writeToOutput = (chunk: string) => {
      if (!muted) {
        originalWrite(chunk);
        return;
      }
      // Echo nothing for the typed characters, but keep the prompt visible.
      if (chunk.includes(question)) originalWrite(chunk);
    };

    rl.question(question, (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });

    muted = true;
  });
}

function validate(username: string, email: string, password: string): string[] {
  const problems: string[] = [];
  if (username.length < 3) problems.push("Username must be at least 3 characters.");
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    problems.push("Username may contain only letters, numbers, dot, underscore and hyphen.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    problems.push("Email address does not look valid.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    problems.push("Password must contain both letters and numbers.");
  }
  return problems;
}

async function main() {
  console.log("\nGanpati CHS — create an administrator account\n");

  const username =
    process.env.ADMIN_USERNAME || (await ask("Admin username: "));
  const email =
    process.env.ADMIN_EMAIL || (await ask("Admin email address: "));
  const password =
    process.env.ADMIN_PASSWORD || (await askSecret("Admin password (hidden): "));

  if (!process.env.ADMIN_PASSWORD) {
    const confirm = await askSecret("Confirm password: ");
    if (confirm !== password) {
      console.error("\nPasswords do not match. Nothing was written.");
      process.exit(1);
    }
  }

  const problems = validate(username, email, password);
  if (problems.length > 0) {
    console.error("\nCould not create the account:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const url = await getDatabaseUrl();
  const prisma = new PrismaClient({ datasourceUrl: url });

  try {
    const normalisedUsername = username.toLowerCase();
    const normalisedEmail = email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const existing = await prisma.adminCredential.findUnique({
      where: { username: normalisedUsername },
      include: { user: true },
    });

    if (existing) {
      const answer = await ask(
        `\nAdmin "${normalisedUsername}" already exists. Reset the password? (yes/no): `,
      );
      if (answer.toLowerCase() !== "yes") {
        console.log("Nothing was changed.");
        return;
      }
      await prisma.adminCredential.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
      console.log(`\nPassword reset for admin "${normalisedUsername}".`);
      return;
    }

    // An admin also needs a User row so that uploads, notices and audit
    // entries can be attributed to a real account.
    const user = await prisma.user.upsert({
      where: { email: normalisedEmail },
      update: { role: "ADMIN", status: "APPROVED" },
      create: {
        email: normalisedEmail,
        name: username,
        role: "ADMIN",
        status: "APPROVED",
      },
    });

    await prisma.adminCredential.create({
      data: { username: normalisedUsername, passwordHash, userId: user.id },
    });

    console.log(`\nAdministrator "${normalisedUsername}" created.`);
    console.log("Sign in at /admin/login\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nFailed to create the administrator:", error);
  process.exit(1);
});
