import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWebPush } from "@/lib/webPush";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = {
  id: string;
  account_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
  last_sent_local_date: string | null;
  daily_goal_minutes: number;
  reminder_hour: number;
};

function localClock(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function GET(request: Request, { params }: { params: Promise<{ hour: string }> }) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent.includes("vercel-cron/1.0")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { hour: hourParam } = await params;
  const utcHour = Number(hourParam);
  if (!Number.isInteger(utcHour) || utcHour < 0 || utcHour > 23) return NextResponse.json({ error: "invalid hour" }, { status: 400 });

  const now = new Date();
  if (now.getUTCHours() !== utcHour) {
    return NextResponse.json({ ok: true, skipped: "outside scheduled UTC hour", utcHour: now.getUTCHours() });
  }

  const rows = await sql`
    SELECT
      ps.id, ps.account_id, ps.endpoint, ps.p256dh, ps.auth, ps.timezone,
      ps.last_sent_local_date, a.daily_goal_minutes, a.reminder_hour
    FROM push_subscriptions ps
    JOIN app_accounts a ON a.id = ps.account_id
    WHERE a.reminder_enabled = true
  `;

  let sent = 0;
  let removed = 0;
  let eligible = 0;

  for (const row of rows as Row[]) {
    let clock;
    try { clock = localClock(row.timezone || "Asia/Tokyo", now); }
    catch { clock = localClock("Asia/Tokyo", now); }
    if (clock.hour !== Number(row.reminder_hour)) continue;
    if (row.last_sent_local_date && String(row.last_sent_local_date).slice(0, 10) === clock.date) continue;
    eligible += 1;

    const [conversationRows, dueRows] = await Promise.all([
      sql`
        SELECT COALESCE(sum(duration_seconds), 0)::int AS seconds
        FROM conversation_sessions
        WHERE account_id = ${row.account_id}
          AND ended_at IS NOT NULL
          AND timezone(${row.timezone || "Asia/Tokyo"}, ended_at)::date = ${clock.date}::date
      `,
      sql`SELECT count(*)::int AS count FROM review_items WHERE account_id = ${row.account_id} AND due_at <= now()`,
    ]);

    const doneMinutes = Math.round(Number(conversationRows[0]?.seconds || 0) / 60);
    const goal = Number(row.daily_goal_minutes || 15);
    const due = Number(dueRows[0]?.count || 0);
    if (doneMinutes >= goal && due <= 0) continue;

    const remaining = Math.max(0, goal - doneMinutes);
    const body = remaining > 0 && due > 0
      ? `今日の会話目標まであと${remaining}分。復習も${due}件あります。`
      : remaining > 0
        ? `今日の会話目標まであと${remaining}分。短くても英語を口に出しておこう。`
        : `会話目標は達成済み。今日の復習が${due}件残っています。`;

    try {
      await sendWebPush(row, {
        title: "EigoLoop 今日の英語学習",
        body,
        url: "/",
        tag: `eigoloop-daily-${clock.date}`,
      });
      await sql`UPDATE push_subscriptions SET last_sent_local_date = ${clock.date}::date, updated_at = now() WHERE id = ${row.id}`;
      sent += 1;
    } catch (error: any) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await sql`DELETE FROM push_subscriptions WHERE id = ${row.id}`;
        removed += 1;
      } else {
        console.error("Scheduled push failed", { subscriptionId: row.id, status, error: error?.message || String(error) });
      }
    }
  }

  return NextResponse.json({ ok: true, utcHour, checked: rows.length, eligible, sent, removed });
}
