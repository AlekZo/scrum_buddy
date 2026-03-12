/**
 * AI service for task merging and deduplication
 * Works with any OpenAI-compatible API (OpenRouter, local LLMs, etc.)
 */

const AI_SETTINGS_KEY = "ai-settings";

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULTS: AISettings = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  model: "google/gemini-2.5-flash",
};

export function getAISettings(): AISettings | null {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.apiKey) return null;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return null;
  }
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAISettings(): void {
  localStorage.removeItem(AI_SETTINGS_KEY);
}

export function isAIConfigured(): boolean {
  return !!getAISettings();
}

export function getAIDefaults(): AISettings {
  return { ...DEFAULTS };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const settings = getAISettings();
  if (!settings) throw new Error("AI not configured");

  const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI error (${res.status}): ${text.slice(0, 200)}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(`AI returned non-JSON response: ${text.slice(0, 200)}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Merge/deduplicate a list of task lines using AI
 * Returns cleaned, consolidated task text
 */
export async function mergeTasks(taskLines: string[]): Promise<string> {
  if (taskLines.length === 0) return "";

  const prompt = `You are a task consolidation assistant. Given these task entries (some may be duplicates or variations), merge duplicates and consolidate similar tasks. Keep time estimates. Return ONLY the cleaned task list, one per line, with bullet points (•). Preserve original language.

Tasks:
${taskLines.map((l) => `- ${l}`).join("\n")}`;

  const result = await chatCompletion([
    { role: "system", content: "You merge and deduplicate task lists. Output only the merged list, nothing else." },
    { role: "user", content: prompt },
  ]);

  return result.trim();
}

/**
 * Polish a single text field: rewrite shorthand into concise, professional bullet points
 */
export async function polishText(text: string): Promise<string> {
  if (!text.trim()) return text;

  const result = await chatCompletion([
    {
      role: "system",
      content:
        "You rewrite shorthand task notes into concise, professional standup-style bullet points. " +
        "Keep it SHORT — each bullet max 1 sentence. Use bullet points (•). " +
        "Do NOT write paragraphs. Do NOT add filler words. Preserve time estimates. " +
        "Preserve the original language of the tasks. Output ONLY the bullet list, nothing else.",
    },
    {
      role: "user",
      content: `Rewrite these shorthand notes into professional bullet points:\n\n${text}`,
    },
  ]);

  return result.trim();
}

/**
 * Suggest a consolidated version of today's standup from raw entries
 */
export async function polishStandup(done: string, doing: string, blockers: string): Promise<{ done: string; doing: string; blockers: string }> {
  const prompt = `Polish this standup update. Merge duplicates, fix typos, make concise. Keep time estimates. Return EXACTLY three sections separated by "---". Preserve the original language of the tasks.

DONE:
${done || "(empty)"}

DOING:
${doing || "(empty)"}

BLOCKERS:
${blockers || "(empty)"}`;

  const result = await chatCompletion([
    { role: "system", content: "You polish standup updates. Return three sections separated by '---'. Each section is bullet points (•). Nothing else." },
    { role: "user", content: prompt },
  ]);

  const parts = result.split("---").map((s) => s.trim());
  return {
    done: parts[0] || done,
    doing: parts[1] || doing,
    blockers: parts[2] || blockers,
  };
}

/**
 * Generate a weekly retrospective from a week of entries
 */
export async function generateWeeklyRetro(
  weekData: { date: string; done: string; doing: string; blockers: string; hours: number }[]
): Promise<string> {
  if (weekData.length === 0) return "No entries for this week.";

  const entriesText = weekData
    .map((d) => `## ${d.date} (${d.hours}h)\nDone:\n${d.done || "(empty)"}\nDoing:\n${d.doing || "(empty)"}\nBlockers:\n${d.blockers || "(empty)"}`)
    .join("\n\n");

  const totalHours = weekData.reduce((s, d) => s + d.hours, 0);

  const result = await chatCompletion([
    {
      role: "system",
      content:
        "You generate concise weekly retrospective summaries from daily standup logs. " +
        "Output sections: 🏆 Key Accomplishments, 📊 Scope & Effort (total hours, biggest time sinks), " +
        "🚧 Blockers Overcome, 🔮 Carry-Forward / Next Week. " +
        "Use bullet points (•). Be analytical, not verbose. Preserve original language of task names.",
    },
    {
      role: "user",
      content: `Generate a weekly retrospective from these daily logs (${totalHours}h total):\n\n${entriesText}`,
    },
  ]);

  return result.trim();
}

/**
 * Auto-categorize tasks with tags like #bugfix, #feature, #meetings, etc.
 */
export async function categorizeTasks(
  tasks: string[]
): Promise<{ task: string; tags: string[] }[]> {
  if (tasks.length === 0) return [];

  const result = await chatCompletion([
    {
      role: "system",
      content:
        "You categorize development tasks. For each task, assign 1-2 tags from: " +
        "#feature, #bugfix, #meetings, #review, #devops, #docs, #refactor, #testing, #design, #research, #support, #planning. " +
        "Return ONLY a JSON array of objects with 'task' (original text) and 'tags' (array of tag strings). " +
        "No markdown fences, no explanation. Just valid JSON.",
    },
    {
      role: "user",
      content: `Categorize these tasks:\n${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    },
  ]);

  try {
    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return tasks.map((t) => ({ task: t, tags: [] }));
  }
}
