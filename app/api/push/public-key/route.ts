import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/webPush";

export const runtime = "nodejs";

export async function GET() {
  try {
    const publicKey = await getVapidPublicKey();
    return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("VAPID public key error", error);
    return NextResponse.json({ error: "push unavailable" }, { status: 503 });
  }
}
