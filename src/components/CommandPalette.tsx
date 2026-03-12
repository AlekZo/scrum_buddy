import { useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { parseTaskInput } from "@/lib/task-parser";
import { createPlanTask, PlanTask, PlanTaskStatus } from "@/lib/plan-types";
import { Package, Vault, CalendarDays, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface CommandPaletteProps {
  projects: string[];
  activeProject: string;
  onSaveTask: (task: PlanTask) => void;
  onSwitchProject: (project: string) => void;
}

/**
 * Global Cmd+K command palette for quick task entry and project switching.
 *
 * Syntax examples:
 *   "Add to Sfera: Wrote API docs - 1h/4h"
 *   "Buffer: completed migration script - 2h"
 *   "Review PR feedback - 3h"  (adds to current project)
 */
export function CommandPalette({
  projects,
  activeProject,
  onSaveTask,
  onSwitchProject,
}: CommandPaletteProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleQuickAdd = useCallback(
    (input: string, targetProject?: string, status: PlanTaskStatus = "active") => {
      // Parse "Add to ProjectName: task text - hours"
      let proj = targetProject || activeProject;
      let text = input;

      // Check for "Add to X:" or "Buffer:" prefix
      const addToMatch = text.match(/^add\s+to\s+(.+?):\s*(.+)/i);
      const bufferMatch = text.match(/^buffer:\s*(.+)/i);

      if (addToMatch) {
        const targetName = addToMatch[1].trim();
        const found = projects.find(
          (p) => p.toLowerCase() === targetName.toLowerCase()
        );
        if (found) proj = found;
        text = addToMatch[2];
        status = "active";
      } else if (bufferMatch) {
        text = bufferMatch[1];
        status = "buffered";
      }

      const parsed = parseTaskInput(text);
      if (!parsed.name) {
        toast.error("Couldn't parse task name");
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const task = createPlanTask(
        parsed.name,
        today,
        today,
        parsed.teamHours,
        proj,
        parsed.actualHours,
        status
      );
      onSaveTask(task);
      toast.success(
        `${status === "buffered" ? "🏦 Buffered" : "Added"}: "${parsed.name}" → ${proj}`
      );
      setOpen(false);
      setValue("");
    },
    [activeProject, projects, onSaveTask]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t("command.placeholder")}
        value={value}
        onValueChange={setValue}
      />
      <CommandList>
        <CommandEmpty>
          {value.trim() ? (
            <button
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded flex items-center gap-2"
              onClick={() => handleQuickAdd(value)}
            >
              <Plus className="w-4 h-4 text-primary" />
              <span>
                Add "<span className="font-semibold">{value}</span>" to{" "}
                <span className="text-primary">{activeProject}</span>
              </span>
            </button>
          ) : (
            <p className="text-muted-foreground text-xs">
              Type a task or command...
            </p>
          )}
        </CommandEmpty>

        {/* Quick actions for typed text */}
        {value.trim() && (
          <CommandGroup heading={t("command.quickActions")}>
            <CommandItem
              onSelect={() => handleQuickAdd(value, activeProject, "active")}
            >
              <Plus className="w-4 h-4 mr-2 text-primary" />
              {t("command.addTo")} {activeProject}
            </CommandItem>
            <CommandItem
              onSelect={() => handleQuickAdd(value, activeProject, "backlog")}
            >
              <Package className="w-4 h-4 mr-2 text-muted-foreground" />
              {t("command.addToBacklog")}
            </CommandItem>
            <CommandItem
              onSelect={() => handleQuickAdd(value, activeProject, "buffered")}
            >
              <Vault className="w-4 h-4 mr-2 text-success" />
              {t("command.bankIt")}
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Switch project */}
        <CommandGroup heading={t("command.switchProject")}>
          {projects.map((proj) => (
            <CommandItem
              key={proj}
              onSelect={() => {
                onSwitchProject(proj);
                setOpen(false);
                toast.success(`Switched to ${proj}`);
              }}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              {proj}
              {proj === activeProject && (
                <span className="ml-auto text-[10px] text-primary">active</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
