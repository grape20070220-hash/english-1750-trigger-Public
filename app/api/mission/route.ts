import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateDailyMission, type DailyMission } from "@/lib/learning";

export const runtime = "nodejs";
export const maxDuration = 30;

function fallbackMission(category = "fluency"): DailyMission {
  const map: Record<string, DailyMission> = {
    grammar: {
      title_ja: "正しい文を1つ長くする",
      instruction_ja: "短い返答で終わらず、because / so を使って理由まで1文つなげよう。",
      targets_en: ["because", "so"],
      success_condition_ja: "理由つきの文を2回以上言えたら達成",
      coach_tip_ja: "完璧さより、止まらず最後まで言い切ることを優先。",
    },
    vocabulary: {
      title_ja: "言い換えで会話を止めない",
      instruction_ja: "単語が出ない時に、簡単な英語で説明し直して会話を続けよう。",
      targets_en: ["It is like...", "I mean..."],
      success_condition_ja: "言い換え表現を1回以上使えたら達成",
      coach_tip_ja: "知らない単語を探すより、知っている英語で説明する練習。",
    },
    naturalness: {
      title_ja: "自然なリアクションを増やす",
      instruction_ja: "返答の最初に短いリアクションを入れてから自分の話を続けよう。",
      targets_en: ["That makes sense.", "Sounds good."],
      success_condition_ja: "自然なリアクションを2回以上使えたら達成",
      coach_tip_ja: "毎回質問で返さず、感想→自分の話の順も試そう。",
    },
    fluency: {
      title_ja: "3秒以内に話し始める",
      instruction_ja: "完璧な文を作ってから話すのではなく、短い一言からすぐ返そう。",
      targets_en: ["Well...", "Let me think."],
      success_condition_ja: "止まりそうな時に時間稼ぎ表現を使って会話を続けたら達成",
      coach_tip_ja: "沈黙より、つなぎ言葉を使いながら考える方が実会話に近い。",
    },
  };
  return map[category] || map.fluency;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dateRows = await sql`SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date::text AS today`;
  const today = String(dateRows[0]?.today || "");
  const existing = await sql`SELECT mission FROM daily_missions WHERE account_id = ${account.id} AND mission_date = ${today}::date LIMIT 1`;
  if (existing[0]?.mission) return NextResponse.json({ mission: existing[0].mission, date: today, cached: true });

  const weaknesses = await sql`
    SELECT category, original_text, corrected_text, explanation_ja, occurrences, lapses, priority
    FROM review_items
    WHERE account_id = ${account.id}
    ORDER BY priority DESC, occurrences DESC, due_at ASC
    LIMIT 8
  `;
  const recent = await sql`
    SELECT scenario_title, analysis
    FROM conversation_sessions
    WHERE account_id = ${account.id} AND ended_at IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 4
  `;

  let mission: DailyMission;
  try {
    mission = await generateDailyMission({
      level: account.level,
      date: today,
      weak_points: weaknesses,
      recent_sessions: recent.map((r: any) => ({
        scenario_title: r.scenario_title,
        scores: r.analysis?.scores || null,
        corrections: Array.isArray(r.analysis?.corrections) ? r.analysis.corrections.slice(0, 4) : [],
        speaking_metrics: r.analysis?.speaking_metrics || null,
        pronunciation: r.analysis?.pronunciation || null,
      })),
    });
  } catch (error) {
    console.error("Daily mission generation failed", error);
    mission = fallbackMission(String((weaknesses[0] as any)?.category || "fluency"));
  }

  const rows = await sql`
    INSERT INTO daily_missions (account_id, mission_date, mission)
    VALUES (${account.id}, ${today}::date, ${JSON.stringify(mission)}::jsonb)
    ON CONFLICT (account_id, mission_date)
    DO UPDATE SET mission = EXCLUDED.mission, updated_at = now()
    RETURNING mission
  `;
  return NextResponse.json({ mission: rows[0]?.mission || mission, date: today, cached: false });
}
