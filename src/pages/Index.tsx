import { useMemo, useCallback, useEffect, useRef } from "react";
import { useScrumData } from "@/hooks/use-scrum-data";
import { usePlanData } from "@/hooks/use-plan-data";
import { ProjectTabs } from "@/components/ProjectTabs";
import { DatePicker } from "@/components/DatePicker";
import { DataIO } from "@/components/DataIO";
import { EntryForm } from "@/components/EntryForm";
import { StandupView } from "@/components/StandupView";
import { TimesheetView } from "@/components/TimesheetView";
import { RecentEntries } from "@/components/RecentEntries";
import { YesterdayPanel } from "@/components/YesterdayPanel";
import { PlanningView } from "@/components/PlanningView";
import { SettingsModal } from "@/components/SettingsModal";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList } from "lucide-react";
import { getYesterdayDate } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { checkAndSendStandups, StandupDataProvider } from "@/lib/standup-scheduler";
import { isTelegramConfigured } from "@/lib/telegram-service";
import { toast } from "sonner";
import { stripActualHours } from "@/lib/text-sanitizer";

const Index = () => {
  const {
    data,
    activeProject,
    setActiveProject,
    selectedDate,
    setSelectedDate,
    currentEntry,
    getEntry,
    saveEntry,
    addProject,
    importData,
    removeProject,
    renameProject,
    getEntriesForProject,
    triggerSync,
    updateDuplicateVersions,
  } = useScrumData();

  const { planData, savePlanTask, removePlanTask, updatePlanTask } = usePlanData();

  const handleCredentialsChange = useCallback(() => {
    triggerSync();
  }, [triggerSync]);

  const yesterdayDate = getYesterdayDate(selectedDate);
  const yesterday = useMemo(
    () => getEntry(activeProject, yesterdayDate),
    [activeProject, yesterdayDate, getEntry]
  );

  const entries = useMemo(
    () => getEntriesForProject(activeProject),
    [activeProject, getEntriesForProject]
  );

  const previousTasks = useMemo(() => {
    return entries
      .filter((e) => e.date !== selectedDate)
      .slice(0, 7)
      .flatMap((e) => {
        const tasks = [...parseTasks(e.done, "done"), ...parseTasks(e.doing, "doing")];
        return tasks.map((t) => ({ task: t, date: e.date }));
      });
  }, [entries, selectedDate]);

  const allProjectsStandup = useMemo(() => {
    return data.projects.map((proj) => ({
      project: proj,
      yesterday: getEntry(proj, yesterdayDate),
      today: getEntry(proj, selectedDate),
    }));
  }, [data.projects, yesterdayDate, selectedDate, getEntry]);

  // Build standup text for telegram scheduler
  const buildStandupText = useCallback((project: string): string => {
    const yd = getYesterdayDate(selectedDate);
    const y = getEntry(project, yd);
    const t = getEntry(project, selectedDate);
    const clean = (text: string) => stripActualHours(text).replace(/•/g, "·").replace(/[<>]/g, "");
    const parts = [
      `<b>Yesterday:</b>\n${clean(y?.done || "No entry")}`,
      `<b>Today:</b>\n${clean(t?.doing || t?.done || "No entry yet")}`,
      `<b>Blockers:</b>\n${clean(t?.blockers || y?.blockers || "None 🎉")}`,
    ];
    return `📋 <b>${project}</b>\n\n${parts.join("\n\n")}`;
  }, [selectedDate, getEntry]);

  // Standup scheduler: check every 30s
  const buildStandupTextRef = useRef(buildStandupText);
  buildStandupTextRef.current = buildStandupText;
  const projectsRef = useRef(data.projects);
  projectsRef.current = data.projects;

  useEffect(() => {
    if (!isTelegramConfigured()) return;
    const provider: StandupDataProvider = {
      getProjects: () => projectsRef.current,
      getStandupText: (p) => buildStandupTextRef.current(p),
    };
    const interval = setInterval(async () => {
      const sent = await checkAndSendStandups(provider);
      if (sent.length > 0) {
        toast.success(`Auto-sent standup for: ${sent.join(", ")}`);
      }
    }, 30_000);
    // Check immediately on mount
    checkAndSendStandups(provider).then((sent) => {
      if (sent.length > 0) toast.success(`Auto-sent standup for: ${sent.join(", ")}`);
    });
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="w-5 h-5 text-primary shrink-0 hidden sm:block" />
              <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">Scrum Logger</h1>
              <SyncStatusIndicator />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="hidden sm:flex items-center gap-1">
                <DataIO data={data} onImport={importData} />
              </div>
              <SettingsModal onCredentialsChange={handleCredentialsChange} projects={data.projects} />
              <DatePicker date={selectedDate} onChange={setSelectedDate} />
            </div>
          </div>
          <ProjectTabs
            projects={data.projects}
            activeProject={activeProject}
            onSelect={setActiveProject}
            onAdd={addProject}
            onRemove={removeProject}
            onRename={renameProject}
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-2 sm:px-4 pb-6">
        {activeProject ? (
          <Tabs defaultValue="log" className="space-y-0">
            <div className="sticky top-[73px] z-[9] bg-background/95 backdrop-blur-sm py-3 border-b border-border/30 -mx-2 sm:-mx-4 px-2 sm:px-4">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="log" className="flex-1 sm:flex-none">Log</TabsTrigger>
                <TabsTrigger value="planning" className="flex-1 sm:flex-none">Planning</TabsTrigger>
                <TabsTrigger value="standup" className="flex-1 sm:flex-none">Standup</TabsTrigger>
                <TabsTrigger value="timesheet" className="flex-1 sm:flex-none">Timesheet</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="log" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <EntryForm
                    entry={currentEntry}
                    date={selectedDate}
                    project={activeProject}
                    previousTasks={previousTasks}
                    yesterday={yesterday}
                    planData={planData}
                    onSave={saveEntry}
                    onUpdateDuplicateVersions={updateDuplicateVersions}
                  />
                </div>
                <div className="space-y-4">
                  <YesterdayPanel entry={yesterday} date={yesterdayDate} />
                  <RecentEntries entries={entries} onSelectDate={setSelectedDate} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="planning" className="mt-4">
              <PlanningView
                project={activeProject}
                planData={planData}
                onSaveTask={savePlanTask}
                onRemoveTask={removePlanTask}
                onUpdateTask={updatePlanTask}
              />
            </TabsContent>

            <TabsContent value="standup" className="mt-4">
              <StandupView
                project={activeProject}
                yesterday={yesterday}
                today={currentEntry}
                allProjectsStandup={allProjectsStandup}
              />
            </TabsContent>

            <TabsContent value="timesheet" className="mt-4">
              <TimesheetView entries={entries} project={activeProject} onSave={saveEntry} planData={planData} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p>Add a project to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
