import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function streakFromDays(today: string, rows: Array<{ day: string }>) {
  const active = new Set(rows.map((r) => String(r.day)));
  const start = new Date(`${today}T00:00:00Z`);
  const todayKey = start.toISOString().slice(0, 10);
  let cursor = new Date(start);
  if (!active.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  for (let i = 0; i < 120; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!active.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    dueRows,
    conversationRows,
    recentRows,
    totalRows,
    todayRows,
    todayReviewRows,
    weekRows,
    scoreRows,
    activeRows,
    todayKeyRows,
    weaknessRows,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM review_items WHERE account_id = ${account.id} AND due_at <= now()`,
    sql`SELECT count(*)::int AS count FROM conversation_sessions WHERE account_id = ${account.id} AND ended_at IS NOT NULL`,
    sql`SELECT scenario_title, ended_at, analysis FROM conversation_sessions WHERE account_id = ${account.id} AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`,
    sql`SELECT COALESCE(sum(duration_seconds), 0)::int AS seconds FROM conversation_sessions WHERE account_id = ${account.id} AND ended_at IS NOT NULL`,
    sql`SELECT COALESCE(sum(duration_seconds), 0)::int AS seconds FROM conversation_sessions WHERE account_id = ${account.id} AND ended_at IS NOT NULL AND (ended_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date`,
    sql`SELECT count(*)::int AS count FROM review_logs WHERE account_id = ${account.id} AND (reviewed_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date`,
    sql`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Tokyo')::date - interval '6 days',
          (now() AT TIME ZONE 'Asia/Tokyo')::date,
          interval '1 day'
        )::date AS day
      )
      SELECT
        to_char(days.day, 'MM/DD') AS label,
        to_char(days.day, 'YYYY-MM-DD') AS day,
        COALESCE(sum(cs.duration_seconds), 0)::int AS seconds
      FROM days
      LEFT JOIN conversation_sessions cs
        ON cs.account_id = ${account.id}
        AND cs.ended_at IS NOT NULL
        AND (cs.ended_at AT TIME ZONE 'Asia/Tokyo')::date = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `,
    sql`
      SELECT
        to_char((ended_at AT TIME ZONE 'Asia/Tokyo')::date, 'MM/DD') AS label,
        round((
          COALESCE((analysis->'scores'->>'fluency')::numeric, 0) +
          COALESCE((analysis->'scores'->>'grammar')::numeric, 0) +
          COALESCE((analysis->'scores'->>'vocabulary')::numeric, 0) +
          COALESCE((analysis->'scores'->>'naturalness')::numeric, 0)
        ) / 4.0, 1) AS average
      FROM conversation_sessions
      WHERE account_id = ${account.id}
        AND ended_at IS NOT NULL
        AND analysis ? 'scores'
      ORDER BY ended_at DESC
      LIMIT 8
    `,
    sql`
      SELECT DISTINCT day FROM (
        SELECT to_char((ended_at AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS day
        FROM conversation_sessions
        WHERE account_id = ${account.id} AND ended_at IS NOT NULL AND ended_at >= now() - interval '120 days'
        UNION
        SELECT to_char((reviewed_at AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS day
        FROM review_logs
        WHERE account_id = ${account.id} AND reviewed_at >= now() - interval '120 days'
      ) d
    `,
    sql`SELECT to_char((now() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS today`,
    sql`
      SELECT category,
        count(*)::int AS items,
        COALESCE(sum(occurrences), 0)::int AS occurrences,
        COALESCE(sum(lapses), 0)::int AS lapses,
        round(COALESCE(sum(priority), 0)::numeric, 1) AS weight
      FROM review_items
      WHERE account_id = ${account.id}
      GROUP BY category
      ORDER BY COALESCE(sum(priority), 0) + COALESCE(sum(lapses), 0) * 0.8 + COALESCE(sum(occurrences), 0) * 0.35 DESC
      LIMIT 5
    `,
  ]);

  const todaySeconds = Number(todayRows[0]?.seconds || 0);
  const goalMinutes = Number(account.daily_goal_minutes || 15);
  const today = String(todayKeyRows[0]?.today || "");

  return NextResponse.json({
    account,
    stats: {
      due: Number(dueRows[0]?.count || 0),
      conversations: Number(conversationRows[0]?.count || 0),
    },
    progress: {
      goalMinutes,
      todayMinutes: Math.round(todaySeconds / 60),
      totalMinutes: Math.round(Number(totalRows[0]?.seconds || 0) / 60),
      todayReviews: Number(todayReviewRows[0]?.count || 0),
      streak: streakFromDays(today, activeRows as Array<{ day: string }>),
      week: (weekRows as Array<{ label: string; day: string; seconds: number }>).map((r) => ({
        label: r.label,
        day: r.day,
        minutes: Math.round(Number(r.seconds || 0) / 60),
      })),
      scoreTrend: (scoreRows as Array<{ label: string; average: string | number }>).reverse().map((r) => ({
        label: r.label,
        average: Number(r.average || 0),
      })),
      weaknesses: (weaknessRows as Array<Record<string, unknown>>).map((r) => ({
        category: String(r.category || "expression"),
        items: Number(r.items || 0),
        occurrences: Number(r.occurrences || 0),
        lapses: Number(r.lapses || 0),
        weight: Number(r.weight || 0),
      })),
    },
    latest: recentRows[0] || null,
  });
}

export async function PATCH(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  const level = ["beginner", "intermediate", "advanced"].includes(body.level) ? body.level : account.level;
  const voice = ["marin", "cedar", "coral", "verse", "sage", "alloy"].includes(body.preferredVoice)
    ? body.preferredVoice
    : account.preferred_voice;
  const dailyGoalMinutes = clampInt(body.dailyGoalMinutes, 5, 120, account.daily_goal_minutes);
  const reminderHour = clampInt(body.reminderHour, 5, 23, account.reminder_hour);
  const reminderEnabled = typeof body.reminderEnabled === "boolean" ? body.reminderEnabled : account.reminder_enabled;
  const conversationStyle = ["natural", "supportive", "immersive"].includes(body.conversationStyle)
    ? body.conversationStyle
    : account.conversation_style;
  const responseLength = ["short", "medium"].includes(body.responseLength)
    ? body.responseLength
    : account.response_length;
  const speechSpeed = ["slow", "normal", "fast"].includes(body.speechSpeed)
    ? body.speechSpeed
    : account.speech_speed;
  const turnPace = ["low", "medium", "high"].includes(body.turnPace)
    ? body.turnPace
    : account.turn_pace;

  await sql`
    UPDATE app_accounts SET
      level = ${level},
      preferred_voice = ${voice},
      daily_goal_minutes = ${dailyGoalMinutes},
      reminder_enabled = ${reminderEnabled},
      reminder_hour = ${reminderHour},
      conversation_style = ${conversationStyle},
      response_length = ${responseLength},
      speech_speed = ${speechSpeed},
      turn_pace = ${turnPace},
      updated_at = now()
    WHERE id = ${account.id}
  `;

  return NextResponse.json({ ok: true });
}
