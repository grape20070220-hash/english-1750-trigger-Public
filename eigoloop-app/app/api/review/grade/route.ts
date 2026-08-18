import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const grade = Number(body.grade);
  if (![0, 1, 2, 3].includes(grade)) return NextResponse.json({ error: "invalid grade" }, { status: 400 });

  const rows = await sql`
    SELECT id, interval_days, ease, repetitions, lapses, priority
    FROM review_items
    WHERE id = ${id} AND account_id = ${account.id}
    LIMIT 1
  `;
  const item = rows[0] as {
    id: string;
    interval_days: number;
    ease: number;
    repetitions: number;
    lapses: number;
    priority: number;
  } | undefined;
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  let interval = Number(item.interval_days);
  let ease = Number(item.ease);
  let repetitions = Number(item.repetitions);
  let lapses = Number(item.lapses);
  let priority = Number(item.priority || 1);
  let dueMs = 24 * 60 * 60 * 1000;

  if (grade === 0) {
    repetitions = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    priority = Math.min(6, priority + 0.8);
    dueMs = 10 * 60 * 1000;
  } else if (grade === 1) {
    interval = Math.max(1, Math.round(interval * 1.15));
    ease = Math.max(1.3, ease - 0.1);
    repetitions += 1;
    priority = Math.min(6, priority + 0.3);
    dueMs = interval * 24 * 60 * 60 * 1000;
  } else if (grade === 2) {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(4, Math.round(interval * ease));
    repetitions += 1;
    priority = Math.max(0.6, priority - 0.15);
    dueMs = interval * 24 * 60 * 60 * 1000;
  } else {
    interval = repetitions === 0 ? 3 : Math.max(4, Math.round(interval * ease * 1.3));
    ease = Math.min(3.2, ease + 0.15);
    repetitions += 1;
    priority = Math.max(0.5, priority - 0.35);
    dueMs = interval * 24 * 60 * 60 * 1000;
  }

  const dueAt = new Date(Date.now() + dueMs).toISOString();
  await sql`
    UPDATE review_items SET
      interval_days = ${interval}, ease = ${ease}, repetitions = ${repetitions}, lapses = ${lapses},
      priority = ${priority}, due_at = ${dueAt}, last_reviewed_at = now()
    WHERE id = ${id} AND account_id = ${account.id}
  `;
  await sql`INSERT INTO review_logs (review_item_id, account_id, grade) VALUES (${id}, ${account.id}, ${grade})`;
  return NextResponse.json({ ok: true, dueAt, priority });
}
