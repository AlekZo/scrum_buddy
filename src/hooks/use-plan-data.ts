import { useState, useCallback, useEffect } from "react";
import { PlanData, PlanTask } from "@/lib/plan-types";

const PLAN_STORAGE_KEY = "daily-scrum-plans";

function loadPlanData(): PlanData {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return { tasks: {} };
    return JSON.parse(raw) as PlanData;
  } catch {
    return { tasks: {} };
  }
}

function savePlanData(data: PlanData): void {
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
}

export function usePlanData() {
  const [planData, setPlanData] = useState<PlanData>(loadPlanData);

  useEffect(() => {
    savePlanData(planData);
  }, [planData]);

  const savePlanTask = useCallback((task: PlanTask) => {
    setPlanData((prev) => ({
      ...prev,
      tasks: { ...prev.tasks, [task.id]: task },
    }));
  }, []);

  const removePlanTask = useCallback((taskId: string) => {
    setPlanData((prev) => {
      const { [taskId]: _, ...rest } = prev.tasks;
      return { ...prev, tasks: rest };
    });
  }, []);

  const updatePlanTask = useCallback((taskId: string, updates: Partial<PlanTask>) => {
    setPlanData((prev) => {
      const existing = prev.tasks[taskId];
      if (!existing) return prev;
      return {
        ...prev,
        tasks: { ...prev.tasks, [taskId]: { ...existing, ...updates } },
      };
    });
  }, []);

  return {
    planData,
    savePlanTask,
    removePlanTask,
    updatePlanTask,
  };
}
