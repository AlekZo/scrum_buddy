import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { ScrumData, Entry, formatDate } from "@/lib/types";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface DataIOProps {
  data: ScrumData;
  onImport: (data: ScrumData) => void;
}

function bulletsToMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("•")) {
        return "- " + trimmed.slice(1).trim();
      }
      return line;
    })
    .join("\n");
}

function entryToMarkdown(entry: Entry): string {
  const parts: string[] = [];
  if (entry.done.trim()) {
    parts.push(`**What I did:**\n${bulletsToMarkdown(entry.done)}`);
  }
  if (entry.doing.trim()) {
    parts.push(`**What I'm doing next:**\n${bulletsToMarkdown(entry.doing)}`);
  }
  if (entry.blockers.trim()) {
    parts.push(`**Blockers:**\n${bulletsToMarkdown(entry.blockers)}`);
  }
  if (entry.hours > 0) {
    parts.push(`**Hours:** ${entry.hours.toFixed(1)}h`);
  }
  return parts.join("\n\n");
}

function generateMarkdown(
  data: ScrumData,
  selectedProjects: string[],
  dateFrom: string,
  dateTo: string
): string {
  const sections: string[] = [];

  for (const project of selectedProjects) {
    const projectEntries = data.entries[project];
    if (!projectEntries) continue;

    const filtered = Object.values(projectEntries)
      .filter((e) => e.date >= dateFrom && e.date <= dateTo)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (filtered.length === 0) continue;

    sections.push(`# ${project}\n`);

    for (const entry of filtered) {
      const content = entryToMarkdown(entry);
      if (content) {
        sections.push(`## ${entry.date}\n\n${content}\n`);
      }
    }
  }

  if (sections.length === 0) {
    return "No entries found for the selected period and projects.";
  }

  return sections.join("\n");
}

export function DataIO({ data, onImport }: DataIOProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);

  const today = formatDate(new Date());
  const thirtyDaysAgo = formatDate(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const openExportDialog = () => {
    setDateFrom(thirtyDaysAgo);
    setDateTo(today);
    setSelectedProjects([...data.projects]);
    setShowExport(true);
  };

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) =>
      prev.includes(name)
        ? prev.filter((p) => p !== name)
        : [...prev, name]
    );
  };

  const handleExport = () => {
    if (selectedProjects.length === 0) {
      toast.error("Select at least one project");
      return;
    }

    const md = generateMarkdown(data, selectedProjects, dateFrom, dateTo);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrum-log-${dateFrom}_${dateTo}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
    toast.success("Exported as Markdown");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as ScrumData;
        if (!parsed.projects || !parsed.entries) {
          toast.error("Invalid log file format");
          return;
        }
        onImport(parsed);
        toast.success(`Imported ${parsed.projects.length} projects`);
      } catch {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={openExportDialog}
          className="h-8 px-2 text-muted-foreground gap-1 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          className="h-8 px-2 text-muted-foreground gap-1 text-xs"
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export as Markdown</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Projects</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {data.projects.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedProjects.includes(p)}
                      onCheckedChange={() => toggleProject(p)}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Export .md
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
