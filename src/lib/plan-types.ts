export interface PlanTask {
  id: string;
  text: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD, same as startDate for single-day
  /** Hours communicated to team/stakeholders (padded estimate) */
  teamHours: number;
  /** Actual expected or real hours */
  actualHours: number;
  project: string;
  /** @deprecated Use teamHours instead. Kept for backward compat during migration. */
  hours?: number;
}

export interface PlanData {
  tasks: Record<string, PlanTask>; // keyed by id
}

export const createPlanTask = (
  text: string,
  startDate: string,
  endDate: string,
  teamHours: number,
  project: string,
  actualHours: number = 0
): PlanTask => ({
  id: crypto.randomUUID(),
  text,
  startDate,
  endDate,
  teamHours,
  actualHours,
  project,
});

/**
 * Migrate legacy tasks that only have `hours` to the new dual-hours model
 */
export function migratePlanTask(task: PlanTask): PlanTask {
  if (task.teamHours === undefined && task.actualHours === undefined && (task as any).hours !== undefined) {
    return {
      ...task,
      teamHours: (task as any).hours || 0,
      actualHours: 0,
    };
  }
  return {
    ...task,
    teamHours: task.teamHours ?? (task as any).hours ?? 0,
    actualHours: task.actualHours ?? 0,
  };
}

/**
 * Get all plan tasks that cover a given date for a project
 */
export function getPlannedTasksForDate(
  planData: PlanData,
  project: string,
  date: string
): PlanTask[] {
  return Object.values(planData.tasks)
    .map(migratePlanTask)
    .filter(
      (t) => t.project === project && t.startDate <= date && t.endDate >= date
    );
}

/**
 * Get all plan tasks for a project in a date range
 */
export function getPlannedTasksForRange(
  planData: PlanData,
  project: string,
  from: string,
  to: string
): PlanTask[] {
  return Object.values(planData.tasks)
    .map(migratePlanTask)
    .filter(
      (t) => t.project === project && t.endDate >= from && t.startDate <= to
    );
}

/**
 * Get the Monday of the week containing the given date
 */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // avoid timezone edge
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Get Mon-Fri dates for the week containing the given date
 */
export function getWeekDays(dateStr: string): string[] {
  const monday = getWeekStart(dateStr);
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${dd}`);
  }
  return days;
}
