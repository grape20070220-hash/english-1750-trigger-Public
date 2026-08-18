import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sendWebPush } from "@/lib/webPush";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE account_id = ${account.id}
    ORDER BY updated_at DESC
  `;
  let sent = 0;
  for (const row of rows as Array<{endpoint:string;p256dh:string;auth:string}>) {
    try {
      await sendWebPush(row, {
        title: "EigoLoop Web Push テスト",
        body: "アプリを閉じていても届くサーバー通知が有効になりました。",
        url: "/",
        tag: "eigoloop-push-test",
      });
      sent += 1;
    } catch (error: any) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`;
      else console.error("Push test failed", error);
    }
  }
  return NextResponse.json({ ok: sent > 0, sent }, { status: sent > 0 ? 200 : 503 });
}
