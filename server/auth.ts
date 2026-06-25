// ── Provenance ──────────────────────────────────────────────────────────────
// canonical:   server/auth.ts → hashPassword(), comparePasswords()
// algorithm:   Node crypto scrypt — no bcrypt dependency
// overrides:   none
// consumed-by: server/routes.ts → POST /api/auth/register (hash)
//              server/routes.ts → POST /api/auth/login (compare)
// note:        hash format is "hex.salt" — both halves required for comparison.
//              Changing this format invalidates all existing stored passwords.
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(
  supplied: string,
  stored: string
): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
