import { describe, it, expect } from "vitest";
import { parseTasks } from "@/lib/task-parser";

describe("time parsing", () => {
  it("should parse bare dash range like '5-7'", () => {
    const tasks = parseTasks("аыаыва 5-7", "done");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].actualHours).toBe(5);
    expect(tasks[0].teamHours).toBe(7);
    expect(tasks[0].text).not.toContain("5-7");
  });

  it("should parse '1.5h-4h' dual dash", () => {
    const tasks = parseTasks("bug fix 1.5h-4h", "done");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].actualHours).toBe(1.5);
    expect(tasks[0].teamHours).toBe(4);
  });

  it("should NOT treat spaced dash as time range: 'task - description'", () => {
    const tasks = parseTasks("task - description", "done");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].hours).toBe(0);
  });
});
