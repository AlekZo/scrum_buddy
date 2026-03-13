import { useState, useCallback, useEffect } from "react";
import {
  PromiseData,
  Promise,
  loadPromises,
  savePromises,
  createPromise,
  parseDeadline,
} from "@/lib/promise-types";
import { formatDate } from "@/lib/types";
import { toast } from "sonner";

export function usePromises() {
  const [promiseData, setPromiseData] = useState<PromiseData>(loadPromises);

  useEffect(() => {
    savePromises(promiseData);
  }, [promiseData]);

  const addPromise = useCallback((text: string, project?: string) => {
    const deadline = parseDeadline(text);
    if (!deadline) {
      // No date found - default to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const p = createPromise(text, formatDate(tomorrow), project);
      setPromiseData((prev) => ({ promises: [...prev.promises, p] }));
      toast.info("No deadline detected — defaulting to tomorrow");
      return p;
    }
    const p = createPromise(text, deadline, project);
    setPromiseData((prev) => ({ promises: [...prev.promises, p] }));
    return p;
  }, []);

  const completePromise = useCallback((id: string) => {
    setPromiseData((prev) => ({
      promises: prev.promises.map((p) =>
        p.id === id ? { ...p, completed: true } : p
      ),
    }));
  }, []);

  const uncompletePromise = useCallback((id: string) => {
    setPromiseData((prev) => ({
      promises: prev.promises.map((p) =>
        p.id === id ? { ...p, completed: false } : p
      ),
    }));
  }, []);

  const updatePromise = useCallback((id: string, text: string) => {
    const deadline = parseDeadline(text);
    setPromiseData((prev) => ({
      promises: prev.promises.map((p) =>
        p.id === id
          ? { ...p, text, ...(deadline ? { deadline } : {}) }
          : p
      ),
    }));
  }, []);

  const updatePromiseDeadline = useCallback((id: string, deadline: string) => {
    setPromiseData((prev) => ({
      promises: prev.promises.map((p) =>
        p.id === id ? { ...p, deadline } : p
      ),
    }));
  }, []);

  const removePromise = useCallback((id: string) => {
    setPromiseData((prev) => ({
      promises: prev.promises.filter((p) => p.id !== id),
    }));
  }, []);

  const getPromisesForDate = useCallback(
    (date: string): Promise[] => {
      return promiseData.promises.filter((p) => p.deadline === date && !p.completed);
    },
    [promiseData.promises]
  );

  const activePromises = promiseData.promises.filter((p) => !p.completed);
  const completedPromises = promiseData.promises.filter((p) => p.completed);

  return {
    promiseData,
    activePromises,
    completedPromises,
    addPromise,
    completePromise,
    uncompletePromise,
    updatePromise,
    updatePromiseDeadline,
    removePromise,
    getPromisesForDate,
  };
}
