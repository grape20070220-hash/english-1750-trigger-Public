import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";
import { analyzeConversation, type TranscriptLine } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId || "");
  const durationSeconds = Math.max(0, Math.min(60 * 60 * 3, Number(body.durationSeconds || 0)));
  const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
    .filter((x: unknown): x is TranscriptLine => {
      if (!x || typeof x !== "object") return false;
      const item = x as TranscriptLine;
      return (item.role === "user" || item.role === "assistant") && typeof item.text === "string" && item.text.trim().length > 0;
    })
    .map((x: TranscriptLine) => ({ role: x.role, text: x.text.trim().slice(0, 2000) }));

  const rows = await sql`SELECT id, scenario, mode FROM conversation_sessions WHERE id = ${sessionId} AND account_id = ${account.id} LIMIT 1`;
  const session = rows[0] as { id: string; scenario: string; mode: string } | undefined;
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  if (transcript.length === 0) {
    await sql`UPDATE conversation_sessions SET transcript = ${JSON.stringify([])}::jsonb, ended_at = now(), duration_seconds = ${durationSeconds} WHERE id = ${sessionId}`;
    return NextResponse.json({ analysis: null, reviewAdded: 0, reviewStrengthened: 0 });
  }

  let analysis;
  try {
    analysis = await analyzeConversation(session.scenario, account.level, transcript);
  } catch (error) {
    console.error("Conversation analysis failed", error);
    await sql`UPDATE conversation_sessions SET transcript = ${JSON.stringify(transcript)}::jsonb, ended_at = now(), duration_seconds = ${durationSeconds} WHERE id = ${sessionId}`;
    return NextResponse.json({ error: "会話は保存しましたが、添削に失敗しました。あとで再分析できるよう履歴は残っています。" }, { status: 502 });
  }

  await sql`
    UPDATE conversation_sessions
    SET transcript = ${JSON.stringify(transcript)}::jsonb,
        analysis = ${JSON.stringify(analysis)}::jsonb,
        ended_at = now(),
        duration_seconds = ${durationSeconds}
    WHERE id = ${sessionId}
  `;

  let reviewAdded = 0;
  let reviewStrengthened = 0;
  for (const correction of analysis.corrections) {
    const existing = await sql`
      SELECT id FROM review_items
      WHERE account_id = ${account.id}
        AND prompt_ja = ${correction.review_prompt_ja}
        AND answer_en = ${correction.review_answer_en}
      LIMIT 1
    `;

    await sql`
      INSERT INTO review_items (
        account_id, source_session_id, category, original_text, corrected_text,
        explanation_ja, prompt_ja, answer_en, due_at, occurrences, priority
      ) VALUES (
        ${account.id}, ${sessionId}, ${correction.category}, ${correction.original}, ${correction.corrected},
        ${correction.explanation_ja}, ${correction.review_prompt_ja}, ${correction.review_answer_en}, now(), 1, 1.4
      )
      ON CONFLICT (account_id, prompt_ja, answer_en)
      DO UPDATE SET
        source_session_id = EXCLUDED.source_session_id,
        category = EXCLUDED.category,
        original_text = EXCLUDED.original_text,
        corrected_text = EXCLUDED.corrected_text,
        explanation_ja = EXCLUDED.explanation_ja,
        occurrences = review_items.occurrences + 1,
        priority = LEAST(6, review_items.priority + 0.55),
        due_at = LEAST(review_items.due_at, now())
    `;

    if (existing.length) reviewStrengthened += 1;
    else reviewAdded += 1;
  }

  return NextResponse.json({ analysis, reviewAdded, reviewStrengthened });
}
