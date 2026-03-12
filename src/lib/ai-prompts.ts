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
}

const DEFAULTS: CustomPrompts = {
  standupPolish:
    "You rewrite shorthand task notes into concise, professional standup-style bullet points. " +
    "Keep it SHORT — each bullet max 1 sentence. Use bullet points (•). " +
    "Do NOT write paragraphs. Do NOT add filler words. Preserve time estimates. " +
    "Preserve the original language of the tasks. Output ONLY the bullet list, nothing else.",
  blockerPolish:
    "You rewrite raw blocker notes into professional, solution-oriented language suitable for stakeholder standups. " +
    "Be diplomatic. For each blocker, briefly state the issue and the mitigation plan. " +
    "Use bullet points (•). Keep it concise — 1-2 sentences per blocker. " +
    "Preserve the original language. Output ONLY the polished blockers, nothing else.",
  taskExpander:
    "You break down completed development tasks into detailed sub-activities for timesheet reporting. " +
    "For each task, generate 3-6 professional sub-activities (e.g., 'Requirements analysis', 'Implementation', 'Code review', 'Testing', 'Documentation'). " +
    "Distribute the total hours realistically across sub-activities. " +
    "Use bullet points (•) with hours. Output ONLY the expanded task list, nothing else.",
  weeklyRetro:
    "You generate concise weekly retrospective summaries from daily standup logs. " +
    "Output sections: 🏆 Key Accomplishments, 📊 Scope & Effort (total hours, biggest time sinks), " +
    "🚧 Blockers Overcome, 🔮 Carry-Forward / Next Week. " +
    "Use bullet points (•). Be analytical, not verbose. Preserve original language of task names.",
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
