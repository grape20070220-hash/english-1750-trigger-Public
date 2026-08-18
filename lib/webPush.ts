import "server-only";
import webpush from "web-push";
import { sql } from "@/lib/db";

export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;
let cachedPublicKey = "";

async function loadVapidKeys() {
  const rows = await sql`
    SELECT key, value
    FROM app_config
    WHERE key IN ('vapid_public_key', 'vapid_private_key')
  `;
  const values = new Map(rows.map((row: Record<string, unknown>) => [String(row.key), String(row.value)]));
  const publicKey = values.get("vapid_public_key") || "";
  const privateKey = values.get("vapid_private_key") || "";
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  return { publicKey, privateKey };
}

export async function getVapidPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  const { publicKey } = await loadVapidKeys();
  cachedPublicKey = publicKey;
  return publicKey;
}

async function ensureConfigured() {
  if (configured) return;
  const { publicKey, privateKey } = await loadVapidKeys();
  webpush.setVapidDetails("https://eigoloop.vercel.app", publicKey, privateKey);
  configured = true;
  cachedPublicKey = publicKey;
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  await ensureConfigured();
  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 6, urgency: "normal" }
  );
}
