export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      app: "EigoLoop",
      build: "2026-08-18-shadowing-v3",
      freeMode: false,
      historyAudio: true,
      shadowing: true
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
