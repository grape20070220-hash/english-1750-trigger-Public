import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

const COOKIE_NAME = "eigoloop_session";
const SESSION_DAYS = 90;

export type Account = {
  id: string;
  sync_id: string;
  display_name: string;
  level: string;
  preferred_voice: string;
  daily_goal_minutes: number;
  reminder_enabled: boolean;
  reminder_hour: number;
  conversation_style: string;
  response_length: string;
  speech_speed: string;
  turn_pace: string;
};

export function hashPin(pin: string, salt: string) {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}

export function verifyPin(pin: string, salt: string, expected: string) {
  const actual = Buffer.from(hashPin(pin, salt), "hex");
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

export function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function makeSyncId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const chunk = (offset: number) => {
    let out = "";
    for (let i = offset; i < offset + 4; i++) out += chars[bytes[i] % chars.length];
    return out;
  };
  return `EIGO-${chunk(0)}-${chunk(4)}`;
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createLoginSession(accountId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sql`INSERT INTO app_sessions (account_id, token_hash, expires_at) VALUES (${accountId}, ${hash}, ${expires.toISOString()})`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function logoutSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await sql`DELETE FROM app_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
  store.delete(COOKIE_NAME);
}

export async function getAccount(): Promise<Account | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await sql`
    SELECT
      a.id, a.sync_id, a.display_name, a.level, a.preferred_voice,
      a.daily_goal_minutes, a.reminder_enabled, a.reminder_hour,
      a.conversation_style, a.response_length, a.speech_speed, a.turn_pace
    FROM app_sessions s
    JOIN app_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  return (rows[0] as Account | undefined) ?? null;
}
