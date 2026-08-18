export type DailyMission = {
  title_ja: string;
  instruction_ja: string;
  targets_en: string[];
  success_condition_ja: string;
  coach_tip_ja: string;
};

export type WeeklyCoachReport = {
  headline_ja: string;
  summary_ja: string;
  wins_ja: string[];
  recurring_issues: Array<{ issue_ja: string; evidence_ja: string; action_ja: string }>;
  next_week_focus_ja: string;
  recommended_scenario_ja: string;
  next_mission_ja: string;
};

const model = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-nano";

function outputText(data: any) {
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function structured<T>(name: string, schema: Record<string, unknown>, system: string, input: unknown): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI ${response.status}`);
  const text = outputText(data);
  if (!text) throw new Error("OpenAI returned no structured output");
  return JSON.parse(text) as T;
}

export async function generateDailyMission(input: unknown) {
  return structured<DailyMission>(
    "eigoloop_daily_mission",
    {
      type: "object",
      additionalProperties: false,
      required: ["title_ja", "instruction_ja", "targets_en", "success_condition_ja", "coach_tip_ja"],
      properties: {
        title_ja: { type: "string" },
        instruction_ja: { type: "string" },
        targets_en: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        success_condition_ja: { type: "string" },
        coach_tip_ja: { type: "string" },
      },
    },
    "You are an English speaking coach. Create one small mission for today's real-time speaking practice. Use the learner's weak points and recent corrections. The mission must be achievable in a 10-20 minute conversation. targets_en must be short reusable English phrases the learner can intentionally say. Japanese fields must be concise and practical. Do not require memorizing obscure vocabulary.",
    input,
  );
}

export async function generateWeeklyCoachReport(input: unknown) {
  return structured<WeeklyCoachReport>(
    "eigoloop_weekly_coach_report",
    {
      type: "object",
      additionalProperties: false,
      required: ["headline_ja", "summary_ja", "wins_ja", "recurring_issues", "next_week_focus_ja", "recommended_scenario_ja", "next_mission_ja"],
      properties: {
        headline_ja: { type: "string" },
        summary_ja: { type: "string" },
        wins_ja: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        recurring_issues: {
          type: "array",
          minItems: 0,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["issue_ja", "evidence_ja", "action_ja"],
            properties: {
              issue_ja: { type: "string" },
              evidence_ja: { type: "string" },
              action_ja: { type: "string" },
            },
          },
        },
        next_week_focus_ja: { type: "string" },
        recommended_scenario_ja: { type: "string" },
        next_mission_ja: { type: "string" },
      },
    },
    "You are the learner's weekly English speaking coach. Analyze only the supplied EigoLoop study data. Be specific, encouraging, and evidence-based. Prioritize speaking ability: fluency, grammar, vocabulary, naturalness, response latency, speaking share, pronunciation clarity, recurring corrections, and practice consistency. Never invent achievements or mistakes not present in the data. Japanese output should be concise enough for an app card.",
    input,
  );
}
