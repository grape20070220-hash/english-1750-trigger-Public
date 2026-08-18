import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// Conservative wall-clock estimate for the current EigoLoop stack:
// GPT-Realtime-2.1 mini + realtime transcription + post-session analysis.
// Actual billing is token based and can vary with speaking ratio and context length.
const ESTIMATED_USD_PER_MINUTE = 0.0175;
const CONFIG_PREFIX = "api_budget:";

type BudgetState = {
  balanceUsd: number;
  anchorTotalSeconds: number;
  updatedAt: string;
};

function clampMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.round(n * 100) / 100));
}

async function totalConversationSeconds(accountId: string) {
  const rows = await sql`
    SELECT COALESCE(sum(duration_seconds), 0)::int AS seconds
    FROM conversation_sessions
    WHERE account_id = ${accountId} AND ended_at IS NOT NULL
  `;
  return Number(rows[0]?.seconds || 0);
}

async function readState(accountId: string): Promise<BudgetState | null> {
  const key = `${CONFIG_PREFIX}${accountId}`;
  const rows = await sql`SELECT value FROM app_config WHERE key = ${key} LIMIT 1`;
  if (!rows.length) return null;
  try {
    const parsed = JSON.parse(String(rows[0].value || "{}"));
    const balanceUsd = clampMoney(parsed.balanceUsd);
    const anchorTotalSeconds = Number(parsed.anchorTotalSeconds || 0);
    if (balanceUsd === null || !Number.isFinite(anchorTotalSeconds)) return null;
    return {
      balanceUsd,
      anchorTotalSeconds: Math.max(0, Math.round(anchorTotalSeconds)),
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch {
    return null;
  }
}

function buildBudget(state: BudgetState | null, totalSeconds: number) {
  const totalMinutes = totalSeconds / 60;
  const estimatedTotalCostUsd = totalMinutes * ESTIMATED_USD_PER_MINUTE;
  if (!state) {
    return {
      configured: false,
      model: "gpt-realtime-2.1-mini",
      estimatedUsdPerMinute: ESTIMATED_USD_PER_MINUTE,
      estimatedCostPer10MinutesUsd: ESTIMATED_USD_PER_MINUTE * 10,
      totalConversationMinutes: Math.round(totalMinutes),
      estimatedTotalCostUsd,
      balanceUsd: null,
      remainingUsd: null,
      remainingMinutes: null,
      status: "unset",
    };
  }

  const secondsSinceAnchor = Math.max(0, totalSeconds - state.anchorTotalSeconds);
  const estimatedSpentSinceAnchorUsd = (secondsSinceAnchor / 60) * ESTIMATED_USD_PER_MINUTE;
  const remainingUsd = Math.max(0, state.balanceUsd - estimatedSpentSinceAnchorUsd);
  const remainingMinutes = Math.max(0, Math.floor(remainingUsd / ESTIMATED_USD_PER_MINUTE));
  const status = remainingMinutes <= 0 ? "empty" : remainingMinutes <= 30 ? "critical" : remainingMinutes <= 120 ? "low" : "ok";

  return {
    configured: true,
    model: "gpt-realtime-2.1-mini",
    estimatedUsdPerMinute: ESTIMATED_USD_PER_MINUTE,
    estimatedCostPer10MinutesUsd: ESTIMATED_USD_PER_MINUTE * 10,
    totalConversationMinutes: Math.round(totalMinutes),
    estimatedTotalCostUsd,
    balanceUsd: state.balanceUsd,
    estimatedSpentSinceAnchorUsd,
    remainingUsd,
    remainingMinutes,
    status,
    updatedAt: state.updatedAt,
  };
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [state, totalSeconds] = await Promise.all([
    readState(account.id),
    totalConversationSeconds(account.id),
  ]);
  return NextResponse.json(buildBudget(state, totalSeconds));
}

export async function PATCH(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const amountUsd = clampMoney(body.amountUsd);
  if (amountUsd === null) return NextResponse.json({ error: "invalid amount" }, { status: 400 });

  const totalSeconds = await totalConversationSeconds(account.id);
  const current = await readState(account.id);
  const action = body.action === "add" ? "add" : "set";

  let nextBalance = amountUsd;
  if (action === "add" && current) {
    const spent = Math.max(0, totalSeconds - current.anchorTotalSeconds) / 60 * ESTIMATED_USD_PER_MINUTE;
    nextBalance = Math.max(0, current.balanceUsd - spent) + amountUsd;
  }
  nextBalance = Math.round(nextBalance * 100) / 100;

  const state: BudgetState = {
    balanceUsd: nextBalance,
    anchorTotalSeconds: totalSeconds,
    updatedAt: new Date().toISOString(),
  };
  const key = `${CONFIG_PREFIX}${account.id}`;
  await sql`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(state)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;

  return NextResponse.json(buildBudget(state, totalSeconds));
}
