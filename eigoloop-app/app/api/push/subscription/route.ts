import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

function validTimezone(value: unknown) {
  const timezone = typeof value === "string" && value.length <= 80 ? value : "Asia/Tokyo";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Asia/Tokyo";
  }
}

export async function POST(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const subscription = body?.subscription;
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint.slice(0, 4000) : "";
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh.slice(0, 1000) : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth.slice(0, 1000) : "";
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });

  const timezone = validTimezone(body?.timezone);
  const userAgent = String(request.headers.get("user-agent") || "").slice(0, 1000);
  await sql`
    INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth, timezone, user_agent, updated_at)
    VALUES (${account.id}, ${endpoint}, ${p256dh}, ${auth}, ${timezone}, ${userAgent}, now())
    ON CONFLICT (endpoint)
    DO UPDATE SET
      account_id = EXCLUDED.account_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      timezone = EXCLUDED.timezone,
      user_agent = EXCLUDED.user_agent,
      updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE account_id = ${account.id} AND endpoint = ${endpoint}`;
  else await sql`DELETE FROM push_subscriptions WHERE account_id = ${account.id}`;
  return NextResponse.json({ ok: true });
}
