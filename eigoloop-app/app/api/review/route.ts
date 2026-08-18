import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const showAll = url.searchParams.get("all") === "1";

  const rows = showAll
    ? await sql`
        SELECT * FROM review_items
        WHERE account_id = ${account.id}
        ORDER BY priority DESC, occurrences DESC, lapses DESC, due_at ASC
        LIMIT 100
      `
    : await sql`
        SELECT * FROM review_items
        WHERE account_id = ${account.id} AND due_at <= now()
        ORDER BY
          (priority + LEAST(occurrences, 6) * 0.12 + LEAST(lapses, 6) * 0.18) DESC,
          due_at ASC
        LIMIT 30
      `;

  return NextResponse.json({ items: rows });
}
