import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";
import { analyzeConversation, type TranscriptLine } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

type PronToken = { token: string; logprob: number };
type RawMetrics = {
  userSpeechMs?: number;
  aiSpeechMs?: number;
  userTurns?: number;
  aiTurns?: number;
  userResponseLatenciesMs?: number[];
  pronunciationTokens?: PronToken[];
};

const clamp = (n: unknown, min: number, max: number) => Math.max(min, Math.min(max, Number(n) || 0));
const round1 = (n: number) => Math.round(n * 10) / 10;

function normalized(text: string) {
  return text.toLowerCase().replace(/[.?!,…]/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

function speakingMetrics(raw: RawMetrics, durationSeconds: number, transcript: TranscriptLine[]) {
  const userSpeechSeconds = round1(clamp(raw.userSpeechMs, 0, durationSeconds * 1000) / 1000);
  const aiSpeechSeconds = round1(clamp(raw.aiSpeechMs, 0, durationSeconds * 1000) / 1000);
  const speakingTotal = userSpeechSeconds + aiSpeechSeconds;
  const latencies = (Array.isArray(raw.userResponseLatenciesMs) ? raw.userResponseLatenciesMs : [])
    .map((x) => clamp(x, 0, 30000) / 1000)
    .filter((x) => Number.isFinite(x));
  const userText = transcript.filter((x) => x.role === "user").map((x) => x.text).join(" ");
  const words = userText.match(/[A-Za-z']+/g) || [];
  const fillers = userText.match(/\b(?:um+|uh+|erm+|hmm+|you know)\b/gi) || [];
  return {
    user_speech_seconds: userSpeechSeconds,
    ai_speech_seconds: aiSpeechSeconds,
    user_speaking_share_percent: speakingTotal > 0 ? Math.round((userSpeechSeconds / speakingTotal) * 100) : 0,
    silent_seconds: round1(Math.max(0, durationSeconds - userSpeechSeconds - aiSpeechSeconds)),
    avg_user_response_seconds: latencies.length ? round1(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    longest_user_response_seconds: latencies.length ? round1(Math.max(...latencies)) : 0,
    user_turns: Math.round(clamp(raw.userTurns, 0, 1000)),
    ai_turns: Math.round(clamp(raw.aiTurns, 0, 1000)),
    filler_count: fillers.length,
    words_per_minute: userSpeechSeconds >= 5 ? Math.round((words.length / userSpeechSeconds) * 60) : 0,
  };
}

function pronunciation(raw: RawMetrics) {
  const tokens = (Array.isArray(raw.pronunciationTokens) ? raw.pronunciationTokens : [])
    .filter((x): x is PronToken => Boolean(x && typeof x.token === "string" && Number.isFinite(Number(x.logprob))))
    .map((x) => ({ token: x.token.trim(), logprob: Number(x.logprob), confidence: Math.max(0, Math.min(1, Math.exp(Number(x.logprob)))) }))
    .filter((x) => /[A-Za-z]/.test(x.token));
  if (!tokens.length) return { clarity_score: 0, confidence_percent: 0, targets: [], advice_ja: "今回の発音データは十分に取得できませんでした。" };
  const avg = tokens.reduce((sum, x) => sum + x.confidence, 0) / tokens.length;
  const clarity = round1(1 + 4 * avg);
  const seen = new Set<string>();
  const targets = [...tokens]
    .sort((a, b) => a.confidence - b.confidence)
    .map((x) => x.token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ""))
    .filter((x) => x.length >= 2 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, 6);
  const advice = clarity >= 4.4
    ? "全体的にかなり明瞭です。低確信度の単語だけ、アクセントと音のつながりを意識して練習しよう。"
    : clarity >= 3.5
      ? "会話は十分通じています。認識が揺れた単語をゆっくり→自然速度の順で言い直すと安定しやすいです。"
      : "認識が不安定な単語が少し多めです。まず1語ずつ明瞭に、その後に短い文でつなげて練習しよう。";
  return { clarity_score: clarity, confidence_percent: Math.round(avg * 100), targets, advice_ja: advice };
}

function makeDrill(analysis: any, transcript: TranscriptLine[], pron: any) {
  const items: any[] = [];
  const corrections = Array.isArray(analysis?.corrections) ? analysis.corrections : [];
  for (const c of corrections.slice(0, 2)) {
    items.push({ type: "say_again", label_ja: "言い直し", prompt_ja: `さっきの「${c.original}」を自然な英語で言い直そう。`, answer_en: c.corrected, tip_ja: c.explanation_ja || "意味を変えず自然な形にする。" });
  }
  for (const c of corrections.slice(0, 2)) {
    if (items.length >= 4) break;
    items.push({ type: "instant", label_ja: "瞬間英作文", prompt_ja: c.review_prompt_ja || "この意味を英語で言ってみよう。", answer_en: c.review_answer_en || c.corrected, tip_ja: "3秒以内に話し始める。" });
  }
  const assistantLines = transcript.filter((x) => x.role === "assistant" && x.text.length >= 12 && x.text.length <= 140);
  const shadow = assistantLines.at(-1)?.text;
  if (shadow && items.length < 5) items.push({ type: "shadowing", label_ja: "シャドーイング", prompt_ja: "音声を聞いた直後に、リズムごと追いかけて言おう。", answer_en: shadow, tip_ja: "単語ごとではなく、意味のかたまりで真似する。" });
  for (const word of Array.isArray(pron?.targets) ? pron.targets : []) {
    if (items.length >= 5) break;
    items.push({ type: "pronunciation", label_ja: "発音", prompt_ja: `「${word}」を3回。最後は短い文の中で言おう。`, answer_en: word, tip_ja: "ゆっくり1回→自然速度2回。" });
  }
  while (items.length < 5) {
    items.push({ type: "fluency", label_ja: "即答", prompt_ja: "今日の会話内容を英語で1文だけ要約しよう。", answer_en: "Say one short sentence about what you talked about.", tip_ja: "完璧さより3秒以内に話し始める。" });
  }
  return { estimated_minutes: 5, items: items.slice(0, 5) };
}

function missionResult(mission: any, transcript: TranscriptLine[]) {
  if (!mission || !Array.isArray(mission.targets_en)) return null;
  const userText = normalized(transcript.filter((x) => x.role === "user").map((x) => x.text).join(" "));
  const targets = mission.targets_en.map((x: unknown) => String(x || "")).filter(Boolean);
  const used = targets.filter((target: string) => {
    const clean = normalized(target.replace(/\.{3}/g, ""));
    return clean.length >= 2 && userText.includes(clean);
  });
  const needed = Math.max(1, Math.min(2, targets.length));
  return {
    title_ja: String(mission.title_ja || "今日のミッション"),
    used_targets: used,
    total_targets: targets.length,
    achieved: used.length >= needed,
  };
}

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

  let baseAnalysis: any;
  try {
    baseAnalysis = await analyzeConversation(session.scenario, account.level, transcript);
  } catch (error) {
    console.error("Conversation analysis failed", error);
    await sql`UPDATE conversation_sessions SET transcript = ${JSON.stringify(transcript)}::jsonb, ended_at = now(), duration_seconds = ${durationSeconds} WHERE id = ${sessionId}`;
    return NextResponse.json({ error: "会話は保存しましたが、添削に失敗しました。あとで再分析できるよう履歴は残っています。" }, { status: 502 });
  }

  const rawMetrics = (body.metrics && typeof body.metrics === "object" ? body.metrics : {}) as RawMetrics;
  const metrics = speakingMetrics(rawMetrics, durationSeconds, transcript);
  const pron = pronunciation(rawMetrics);
  const todayRows = await sql`SELECT mission FROM daily_missions WHERE account_id = ${account.id} AND mission_date = (now() AT TIME ZONE 'Asia/Tokyo')::date LIMIT 1`;
  const mission = todayRows[0]?.mission || null;
  const analysis = {
    ...baseAnalysis,
    speaking_metrics: metrics,
    pronunciation: pron,
    mission_result: missionResult(mission, transcript),
    five_minute_drill: makeDrill(baseAnalysis, transcript, pron),
  };

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
  for (const correction of Array.isArray(analysis.corrections) ? analysis.corrections : []) {
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
