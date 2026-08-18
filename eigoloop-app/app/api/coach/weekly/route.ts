import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateWeeklyCoachReport } from "@/lib/learning";

export const runtime = "nodejs";
export const maxDuration = 45;

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const weekRows = await sql`SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Tokyo')::date::text AS week_start`;
  const weekStart = String(weekRows[0]?.week_start || "");

  const sessions = await sql`
    SELECT id, scenario_title, ended_at, duration_seconds, analysis
    FROM conversation_sessions
    WHERE account_id = ${account.id}
      AND ended_at IS NOT NULL
      AND (ended_at AT TIME ZONE 'Asia/Tokyo')::date >= ${weekStart}::date
    ORDER BY ended_at ASC
    LIMIT 40
  `;
  if (!sessions.length) return NextResponse.json({ report: null, weekStart, reason: "no_sessions" });

  const weaknesses = await sql`
    SELECT category, original_text, corrected_text, occurrences, lapses, priority
    FROM review_items
    WHERE account_id = ${account.id}
    ORDER BY priority DESC, occurrences DESC
    LIMIT 10
  `;

  const signature = crypto.createHash("sha256").update(JSON.stringify({
    sessions: sessions.map((s: any) => [s.id, s.ended_at, s.duration_seconds, s.analysis?.scores, s.analysis?.speaking_metrics, s.analysis?.pronunciation]),
    weaknesses: weaknesses.map((w: any) => [w.category, w.occurrences, w.lapses, w.priority]),
  })).digest("hex");

  const cached = await sql`
    SELECT report, source_signature, generated_at
    FROM weekly_coach_reports
    WHERE account_id = ${account.id} AND week_start = ${weekStart}::date
    LIMIT 1
  `;
  if (cached[0]?.report && cached[0]?.source_signature === signature) {
    return NextResponse.json({ report: cached[0].report, weekStart, generatedAt: cached[0].generated_at, cached: true });
  }

  const scoreBuckets: Record<string, number[]> = { fluency: [], grammar: [], vocabulary: [], naturalness: [] };
  let userSpeechSeconds = 0;
  let aiSpeechSeconds = 0;
  const responseLatencies: number[] = [];
  const pronunciationScores: number[] = [];
  let fillerCount = 0;
  for (const s of sessions as any[]) {
    for (const key of Object.keys(scoreBuckets)) {
      const value = Number(s.analysis?.scores?.[key]);
      if (Number.isFinite(value) && value > 0) scoreBuckets[key].push(value);
    }
    const m = s.analysis?.speaking_metrics;
    userSpeechSeconds += Number(m?.user_speech_seconds || 0);
    aiSpeechSeconds += Number(m?.ai_speech_seconds || 0);
    if (Number(m?.avg_user_response_seconds) >= 0) responseLatencies.push(Number(m.avg_user_response_seconds));
    fillerCount += Number(m?.filler_count || 0);
    const p = Number(s.analysis?.pronunciation?.clarity_score);
    if (p > 0) pronunciationScores.push(p);
  }

  const totalSeconds = (sessions as any[]).reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);
  const speakingTotal = userSpeechSeconds + aiSpeechSeconds;
  const stats = {
    conversations: sessions.length,
    minutes: Math.round(totalSeconds / 60),
    average_scores: Object.fromEntries(Object.entries(scoreBuckets).map(([k, v]) => [k, average(v)])),
    user_speaking_share_percent: speakingTotal > 0 ? Math.round((userSpeechSeconds / speakingTotal) * 100) : null,
    average_response_seconds: responseLatencies.length ? average(responseLatencies) : null,
    average_pronunciation_clarity: pronunciationScores.length ? average(pronunciationScores) : null,
    filler_count: fillerCount,
  };

  let report;
  try {
    report = await generateWeeklyCoachReport({
      level: account.level,
      week_start: weekStart,
      stats,
      sessions: (sessions as any[]).slice(-12).map((s) => ({
        scenario: s.scenario_title,
        scores: s.analysis?.scores || null,
        summary_ja: s.analysis?.summary_ja || "",
        corrections: Array.isArray(s.analysis?.corrections) ? s.analysis.corrections.slice(0, 4) : [],
        speaking_metrics: s.analysis?.speaking_metrics || null,
        pronunciation: s.analysis?.pronunciation || null,
        mission_result: s.analysis?.mission_result || null,
      })),
      priority_weaknesses: weaknesses,
    });
  } catch (error) {
    console.error("Weekly coach report generation failed", error);
    return NextResponse.json({ error: "週次レポートの生成に失敗しました" }, { status: 502 });
  }

  const stored = await sql`
    INSERT INTO weekly_coach_reports (account_id, week_start, source_signature, report)
    VALUES (${account.id}, ${weekStart}::date, ${signature}, ${JSON.stringify(report)}::jsonb)
    ON CONFLICT (account_id, week_start)
    DO UPDATE SET source_signature = EXCLUDED.source_signature, report = EXCLUDED.report, generated_at = now()
    RETURNING report, generated_at
  `;

  return NextResponse.json({ report: stored[0]?.report || report, weekStart, generatedAt: stored[0]?.generated_at, cached: false, stats });
}
