import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env then .env.local (so .env.local wins) for scripts run outside the
 * Next.js runtime, which does this for us automatically.
 *
 * Uses Node's built-in env file loader — no dotenv dependency.
 */
export function loadEnv(): void {
  for (const file of [".env", ".env.local"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    try {
      process.loadEnvFile(full);
    } catch (error) {
      console.warn(`[env] Could not read ${file}:`, error);
    }
  }
}

loadEnv();
