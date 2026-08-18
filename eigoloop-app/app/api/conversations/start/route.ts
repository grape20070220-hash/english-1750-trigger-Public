import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const conversationMode = body.mode === "custom" ? "custom" : "free";
  const mode = `openai:${conversationMode}`;
  const scenario = String(body.scenario || "Free conversation about anything the learner wants to discuss.").trim().slice(0, 1500);
  const title = conversationMode === "free" ? "AIフリートーク" : (scenario.slice(0, 34) || "カスタム会話");
  const rows = await sql`
    INSERT INTO conversation_sessions (account_id, scenario, scenario_title, mode)
    VALUES (${account.id}, ${scenario}, ${title}, ${mode})
    RETURNING id, started_at
  `;
  return NextResponse.json(rows[0]);
}
