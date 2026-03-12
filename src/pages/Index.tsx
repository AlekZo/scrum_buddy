import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useScrumData } from "@/hooks/use-scrum-data";
import { usePlanData } from "@/hooks/use-plan-data";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { ProjectDropdown } from "@/components/ProjectDropdown";
import { EmptyState } from "@/components/EmptyState";
import { DatePicker } from "@/components/DatePicker";
import { DataIO } from "@/components/DataIO";
import { EntryForm } from "@/components/EntryForm";
import { StandupView } from "@/components/StandupView";
import { TimesheetView } from "@/components/TimesheetView";
import { RecentEntries } from "@/components/RecentEntries";
import { CalendarLogView } from "@/components/CalendarLogView";
import { YesterdayPanel } from "@/components/YesterdayPanel";
import { PlanningView } from "@/components/PlanningView";
import { CommandPalette } from "@/components/CommandPalette";
import { WeeklyRetro } from "@/components/WeeklyRetro";
import { SettingsModal } from "@/components/SettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { getYesterdayDate, getToday } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";
import { checkAndSendStandups, StandupDataProvider } from "@/lib/standup-scheduler";
import { isTelegramConfigured } from "@/lib/telegram-service";
import { toast } from "sonner";
import { stripActualHours } from "@/lib/text-sanitizer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/lib/i18n";

const Index = () => {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(57);

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
  const handleAddProject = useCallback((name: string) => {
    addProject(name);
    setShowAddProject(false);
    setNewProjectName("");
  }, [addProject]);

  // Empty state CTA handler — opens dialog instead of native prompt()
  const handleEmptyStateAdd = useCallback(() => {
    setNewProjectName("");
    setShowAddProject(true);
  }, []);

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
    const escapeHTML = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const clean = (text: string) => escapeHTML(stripActualHours(text).replace(/•/g, "·"));
    const parts = [
      `<b>Yesterday:</b>\n${clean(y?.done || "No entry")}`,
      `<b>Today:</b>\n${clean(t?.doing || t?.done || "No entry yet")}`,
      `<b>Blockers:</b>\n${clean(t?.blockers || y?.blockers || "None 🎉")}`,
    ];
    return `📋 <b>${escapeHTML(project)}</b>\n\n${parts.join("\n\n")}`;
  }, [selectedDate, getEntry]);

  // Standup scheduler: check every 30s
  const buildStandupTextRef = useRef(buildStandupText);
  buildStandupTextRef.current = buildStandupText;
  const projectsRef = useRef(data.projects);
  projectsRef.current = data.projects;

  // Reactive Telegram config key — incremented when settings change
  const [telegramConfigVersion, setTelegramConfigVersion] = useState(0);
  const handleCredentialsChange = useCallback(() => {
    triggerSync();
    setTelegramConfigVersion((v) => v + 1);
  }, [triggerSync]);

  const initCheckRun = useRef(false);
  useEffect(() => {
    if (!isTelegramConfigured()) return;
    const provider: StandupDataProvider = {
      getProjects: () => projectsRef.current,
      getStandupText: (p) => buildStandupTextRef.current(p),
    };
    const interval = setInterval(async () => {
      try {
        const sent = await checkAndSendStandups(provider);
        if (sent.length > 0) {
          toast.success(`Auto-sent standup for: ${sent.join(", ")}`);
        }
      } catch (err) {
        console.error("[standup-scheduler] Poll failed:", err);
      }
    }, 30_000);
    if (!initCheckRun.current) {
      initCheckRun.current = true;
      checkAndSendStandups(provider)
        .then((sent) => {
          if (sent.length > 0) toast.success(`Auto-sent standup for: ${sent.join(", ")}`);
        })
        .catch((err) => console.error("[standup-scheduler] Initial check failed:", err));
    }
    return () => clearInterval(interval);
  }, [telegramConfigVersion]);

  // Dynamically measure header height for sticky tab offset
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHeaderHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Midnight rollover: auto-update selectedDate when user returns to the tab on a new day
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const today = getToday();
        if (selectedDate !== today) {
          setSelectedDate(today);
          toast.info(`Date rolled over to ${today}`, { duration: 3000 });
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [selectedDate, setSelectedDate]);

  const hasProjects = data.projects.length > 0;

  const mainContent = (
    <>
      {/* Global Command Palette (Cmd+K) */}
      {hasProjects && (
        <CommandPalette
          projects={data.projects}
          activeProject={activeProject}
          onSaveTask={savePlanTask}
          onSwitchProject={setActiveProject}
        />
      )}
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10" ref={headerRef}>
        <div className="px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Desktop: sidebar trigger */}
              {!isMobile && hasProjects && <SidebarTrigger className="shrink-0" />}
              <ClipboardList className="w-5 h-5 text-primary shrink-0 hidden sm:block" />
              <h1 className="text-sm sm:text-lg font-bold tracking-tight truncate">{t("app.title")}</h1>
              <SyncStatusIndicator />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Mobile: project dropdown */}
              {isMobile && hasProjects && (
                <ProjectDropdown
                  projects={data.projects}
                  activeProject={activeProject}
                  onSelect={setActiveProject}
                  onAdd={handleAddProject}
                />
              )}
              <div className="hidden sm:flex items-center gap-1">
                <DataIO data={data} onImport={importData} />
              </div>
              <ThemeToggle />
              <SettingsModal onCredentialsChange={handleCredentialsChange} projects={data.projects} />
              <DatePicker date={selectedDate} onChange={setSelectedDate} />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="px-3 sm:px-6 pb-6">
        {!hasProjects ? (
          <EmptyState onAddProject={handleEmptyStateAdd} />
        ) : !activeProject ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>{t("common.selectProject")}</p>
          </div>
        ) : (
          <Tabs defaultValue="log" className="space-y-0">
            {/* Sticky view tabs — uses CSS sticky, no hardcoded offset */}
            <div className="sticky z-[9] bg-background/95 backdrop-blur-sm py-3 border-b border-border/30" style={{ top: headerHeight }}>
              <TabsList className="w-full sm:w-auto overflow-x-auto overflow-y-hidden justify-start sm:justify-center no-scrollbar">
                <TabsTrigger value="log" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm">{t("nav.log")}</TabsTrigger>
                <TabsTrigger value="planning" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm">{t("nav.planning")}</TabsTrigger>
                <TabsTrigger value="standup" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm">{t("nav.standup")}</TabsTrigger>
                <TabsTrigger value="timesheet" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm">{t("nav.timesheet")}</TabsTrigger>
                <TabsTrigger value="insights" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] text-xs sm:text-sm">{t("nav.insights")}</TabsTrigger>
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
                  <CalendarLogView
                    entries={entries}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                  />
                  <YesterdayPanel entry={yesterday} date={yesterdayDate} />
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

            <TabsContent value="insights" className="mt-4">
              <WeeklyRetro entries={entries} project={activeProject} selectedDate={selectedDate} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Add Project Dialog (replaces native prompt) */}
      <Dialog open={showAddProject} onOpenChange={setShowAddProject}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sidebar.addProject")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder={t("sidebar.addProject")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newProjectName.trim()) {
                handleAddProject(newProjectName.trim());
              }
            }}
            autoFocus
            className="text-base sm:text-sm"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddProject(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => newProjectName.trim() && handleAddProject(newProjectName.trim())}
              disabled={!newProjectName.trim()}
            >
              {t("settings.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // Desktop: sidebar layout. Mobile: no sidebar (uses dropdown).
  if (isMobile || !hasProjects) {
    return <div className="min-h-[100dvh] bg-background pb-[env(safe-area-inset-bottom)]">{mainContent}</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-background">
        <ProjectSidebar
          projects={data.projects}
          activeProject={activeProject}
          onSelect={setActiveProject}
          onAdd={handleAddProject}
          onRemove={removeProject}
          onRename={renameProject}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {mainContent}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
