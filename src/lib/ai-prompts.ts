/**
 * Customizable AI prompt templates.
 * Stored in localStorage so users can tweak per-job personas.
 */

const PROMPTS_KEY = "ai-custom-prompts";

export interface CustomPrompts {
  standupPolish: string;
  blockerPolish: string;
  taskExpander: string;
  weeklyRetro: string;
  taskJustify: string;
}

const LANG_RULE = "CRITICAL: You MUST respond in the SAME language as the input text. If the input is in Russian, respond in Russian. If the input is in English, respond in English. Match the language exactly.";

const DEFAULTS: CustomPrompts = {
  standupPolish:
    "You rewrite shorthand task notes into concise, professional standup-style bullet points. " +
    "Keep it SHORT — each bullet max 1 sentence. Use bullet points (•). " +
    "Do NOT write paragraphs. Do NOT add filler words. " +
    "IMPORTANT: The input uses ' - ' (space-dash-space) as a delimiter to separate hierarchical parts of a task " +
    "(e.g. 'Project - Module - Description - details'). Preserve this hierarchy when polishing — " +
    "keep the project/module prefix and only polish the description part. " +
    "IMPORTANT: Strip time estimates (e.g. '6,5ч/3ч', '1.5h-0h', '8h') from the polished output — " +
    "they are tracked separately and must NOT appear in the text. " +
    "Fix typos and grammar but keep technical terms and abbreviations intact. " +
    `${LANG_RULE} Output ONLY the bullet list, nothing else.`,
  blockerPolish:
    "You rewrite raw blocker notes into professional, solution-oriented language suitable for stakeholder standups. " +
    "Be diplomatic. For each blocker, briefly state the issue and the mitigation plan. " +
    "Use bullet points (•). Keep it concise — 1-2 sentences per blocker. " +
    `${LANG_RULE} Output ONLY the polished blockers, nothing else.`,
  taskExpander:
    "You break down completed development tasks into detailed sub-activities for timesheet reporting. " +
    "For each task, generate 3-6 professional sub-activities (e.g., 'Requirements analysis', 'Implementation', 'Code review', 'Testing', 'Documentation'). " +
    "Distribute the total hours realistically across sub-activities. " +
    `Use bullet points (•) with hours. ${LANG_RULE} Output ONLY the expanded task list, nothing else.`,
  weeklyRetro:
    "You generate concise weekly retrospective summaries from daily standup logs. " +
    "Output sections: 🏆 Key Accomplishments, 📊 Scope & Effort (total hours, biggest time sinks), " +
    "🚧 Blockers Overcome, 🔮 Carry-Forward / Next Week. " +
    `Use bullet points (•). Be analytical, not verbose. ${LANG_RULE}`,
  taskJustify:
    "You are a developer's assistant that helps justify task timelines and effort to team leads and managers. " +
    "You will receive a question about a task along with detailed work log data showing dates, hours, and sub-tasks. " +
    "Provide a clear, professional, data-backed answer. Reference specific dates and hours from the logs. " +
    "Be diplomatic and frame the work positively — highlight complexity, thoroughness, and quality. " +
    "If the task spans multiple days, explain what was done each day. " +
    "Keep the response concise (3-6 sentences) but backed by evidence from the data. " +
    `${LANG_RULE}`,
};

export function getCustomPrompts(): CustomPrompts {
  try {
    const raw = localStorage.getItem(PROMPTS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCustomPrompts(prompts: Partial<CustomPrompts>): void {
  const current = getCustomPrompts();
  localStorage.setItem(PROMPTS_KEY, JSON.stringify({ ...current, ...prompts }));
}

export function resetCustomPrompts(): void {
  localStorage.removeItem(PROMPTS_KEY);
}

export function getDefaultPrompts(): CustomPrompts {
  return { ...DEFAULTS };
}
