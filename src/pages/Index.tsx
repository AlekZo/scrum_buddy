import { useMemo } from "react";
import { useScrumData } from "@/hooks/use-scrum-data";
import { ProjectTabs } from "@/components/ProjectTabs";
import { DatePicker } from "@/components/DatePicker";
import { DataIO } from "@/components/DataIO";
import { EntryForm } from "@/components/EntryForm";
import { StandupView } from "@/components/StandupView";
import { TimesheetView } from "@/components/TimesheetView";
import { RecentEntries } from "@/components/RecentEntries";
import { YesterdayPanel } from "@/components/YesterdayPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardList } from "lucide-react";
import { formatDate, getYesterdayDate } from "@/lib/types";
import { parseTasks } from "@/lib/task-parser";

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
  } = useScrumData();

  const yesterdayDate = getYesterdayDate(selectedDate);
  const yesterday = useMemo(
    () => getEntry(activeProject, yesterdayDate),
    [activeProject, yesterdayDate, getEntry]
  );

  const entries = useMemo(
    () => getEntriesForProject(activeProject),
    [activeProject, getEntriesForProject]
  );

  // Collect previous tasks for merge suggestions (last 7 entries, excluding current date)
  const previousTasks = useMemo(() => {
    return entries
      .filter((e) => e.date !== selectedDate)
      .slice(0, 7)
      .flatMap((e) => {
        const tasks = [...parseTasks(e.done, "done"), ...parseTasks(e.doing, "doing")];
        return tasks.map((t) => ({ task: t, date: e.date }));
      });
  }, [entries, selectedDate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">Daily Scrum Logger</h1>
            </div>
            <div className="flex items-center gap-2">
              <DataIO data={data} onImport={importData} />
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

      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeProject ? (
          <Tabs defaultValue="log" className="space-y-4">
            <TabsList>
              <TabsTrigger value="log">Log</TabsTrigger>
              <TabsTrigger value="standup">Standup</TabsTrigger>
              <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
            </TabsList>

            <TabsContent value="log">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <EntryForm
                    entry={currentEntry}
                    date={selectedDate}
                    project={activeProject}
                    previousTasks={previousTasks}
                    yesterday={yesterday}
                    onSave={saveEntry}
                  />
                </div>
                <div className="space-y-4">
                  <YesterdayPanel entry={yesterday} date={yesterdayDate} />
                  <RecentEntries entries={entries} onSelectDate={setSelectedDate} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="standup">
              <StandupView
                project={activeProject}
                yesterday={yesterday}
                today={currentEntry}
              />
            </TabsContent>

            <TabsContent value="timesheet">
              <TimesheetView entries={entries} project={activeProject} onSave={saveEntry} />
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
