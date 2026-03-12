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
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("[storage] Failed to save plan data:", err);
  }
}

export function usePlanData() {
  const [planData, setPlanData] = useState<PlanData>(loadPlanData);

  useEffect(() => {
    savePlanData(planData);
  }, [planData]);

  // Cross-tab sync for plan data
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PLAN_STORAGE_KEY && e.newValue) {
        try {
          setPlanData(JSON.parse(e.newValue) as PlanData);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

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
