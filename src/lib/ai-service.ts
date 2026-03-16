/**
 * AI service for task merging, polishing, and expansion
 * Works with any OpenAI-compatible API (OpenRouter, local LLMs, etc.)
 */

import { getCustomPrompts } from "@/lib/ai-prompts";

const AI_SETTINGS_KEY = "ai-settings";

export type AIProvider = "openrouter" | "ollama";

export interface AISettings {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PROVIDER_PRESETS: Record<AIProvider, { baseUrl: string; model: string; needsKey: boolean }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash", needsKey: true },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.1", needsKey: false },
};

const DEFAULTS: AISettings = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  model: "google/gemini-2.5-flash",
};

export function getAISettings(): AISettings | null {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ollama doesn't need an API key
    if (parsed.provider === "ollama") return { ...DEFAULTS, ...parsed };
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
  const s = getAISettings();
  if (!s) return false;
  // Ollama doesn't need a key
  if (s.provider === "ollama") return true;
  return !!s.apiKey;
}

export function getOllamaSettings(): AISettings {
  const preset = PROVIDER_PRESETS.ollama;
  return { provider: "ollama", baseUrl: preset.baseUrl, apiKey: "", model: preset.model };
}

export function getAIDefaults(): AISettings {
  return { ...DEFAULTS };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AIError extends Error {
  status?: number;
  provider: AIProvider;
  constructor(message: string, provider: AIProvider, status?: number) {
    super(message);
    this.name = "AIError";
    this.provider = provider;
    this.status = status;
  }
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const settings = getAISettings();
  if (!settings) throw new Error("AI not configured");

  const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new AIError(
      `Cannot reach ${settings.provider === "ollama" ? "Ollama" : "OpenRouter"}: ${msg}`,
      settings.provider
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new AIError(
      `${settings.provider === "ollama" ? "Ollama" : "OpenRouter"} error (${res.status}): ${text.slice(0, 300)}`,
      settings.provider,
      res.status
    );
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
 * Polish a single text field using customizable prompt
 */
export async function polishText(text: string): Promise<string> {
  if (!text.trim()) return text;
  const prompts = getCustomPrompts();

  const result = await chatCompletion([
    { role: "system", content: prompts.standupPolish },
    { role: "user", content: `Rewrite these shorthand notes into professional bullet points:\n\n${text}` },
  ]);

  return result.trim();
}

/**
 * Polish blockers into professional, diplomatic language
 */
export async function polishBlockers(text: string): Promise<string> {
  if (!text.trim()) return text;
  const prompts = getCustomPrompts();

  const result = await chatCompletion([
    { role: "system", content: prompts.blockerPolish },
    { role: "user", content: `Rewrite these blocker notes into professional, solution-oriented language:\n\n${text}` },
  ]);

  return result.trim();
}

/**
 * Polish a complete standup
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
 * Generate a weekly retrospective
 */
export async function generateWeeklyRetro(
  weekData: { date: string; done: string; doing: string; blockers: string; hours: number }[]
): Promise<string> {
  if (weekData.length === 0) return "No entries for this week.";
  const prompts = getCustomPrompts();

  const entriesText = weekData
    .map((d) => `## ${d.date} (${d.hours}h)\nDone:\n${d.done || "(empty)"}\nDoing:\n${d.doing || "(empty)"}\nBlockers:\n${d.blockers || "(empty)"}`)
    .join("\n\n");

  const totalHours = weekData.reduce((s, d) => s + d.hours, 0);

  const result = await chatCompletion([
    { role: "system", content: prompts.weeklyRetro },
    { role: "user", content: `Generate a weekly retrospective from these daily logs (${totalHours}h total):\n\n${entriesText}` },
  ]);

  return result.trim();
}

/**
 * Auto-categorize tasks with tags
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

/**
 * Expand tasks into detailed sub-activities for timesheet padding
 * Takes a list of tasks and breaks each into professional sub-activities
 */
export async function expandTasksForTimesheet(
  tasks: { name: string; hours: number }[],
  targetHours: number = 8
): Promise<string> {
  if (tasks.length === 0) return "";
  const prompts = getCustomPrompts();

  const taskList = tasks.map((t) => `• ${t.name} — ${t.hours}h`).join("\n");
  const currentTotal = tasks.reduce((s, t) => s + t.hours, 0);

  const result = await chatCompletion([
    { role: "system", content: prompts.taskExpander },
    {
      role: "user",
      content: `Break down these tasks into detailed sub-activities. Current total: ${currentTotal}h, target: ${targetHours}h. Distribute hours to fill the target.\n\n${taskList}`,
    },
  ]);

  return result.trim();
}

export interface BreakdownTask {
  taskName: string;
  teamHours: number;
  actualHours: number;
}

/**
 * AI-powered epic/project breakdown into granular standup-ready tasks
 * with dual time estimates (team vs actual)
 */
export async function generateProjectBreakdown(
  description: string,
  fileContext: string = ""
): Promise<BreakdownTask[]> {
  if (!description.trim() && !fileContext.trim()) return [];

  const contextBlock = fileContext
    ? `\n\nAdditional context from uploaded file:\n${fileContext}`
    : "";

  const result = await chatCompletion([
    {
      role: "system",
      content:
        "You are a senior software engineer planning a sub-project. " +
        "Break requirements into 4-8 granular tasks suitable for daily Scrum standup updates. " +
        "Return ONLY a valid JSON array with objects containing: " +
        '"taskName" (action-oriented, past tense, e.g. "Drafted initial API endpoint specs"), ' +
        '"teamHours" (estimated hours for a standard developer, max 8 per task), and ' +
        '"actualHours" (estimated hours for an AI-assisted 10x developer, usually 10-20% of teamHours). ' +
        "No markdown fences, no explanation. Just valid JSON.",
    },
    {
      role: "user",
      content: `Break down this project into standup-ready tasks with dual time estimates:\n\n${description}${contextBlock}`,
    },
  ]);

  try {
    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as BreakdownTask[];
    // Validate & sanitize
    return parsed
      .filter((t) => t.taskName && typeof t.taskName === "string")
      .map((t) => ({
        taskName: t.taskName.trim(),
        teamHours: Math.max(0.25, Number(t.teamHours) || 1),
        actualHours: Math.max(0.25, Number(t.actualHours) || 0.25),
      }));
  } catch {
    throw new Error("AI returned invalid JSON. Please try again.");
  }
}

/**
 * Answer questions about task history — justify timelines, explain effort, etc.
 */
export async function justifyTask(
  question: string,
  taskData: string
): Promise<string> {
  if (!question.trim()) return "";
  const prompts = getCustomPrompts();

  const result = await chatCompletion([
    { role: "system", content: prompts.taskJustify },
    {
      role: "user",
      content: `Question: ${question}\n\nWork log data:\n${taskData}`,
    },
  ]);

  return result.trim();
}
