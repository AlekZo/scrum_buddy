import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileText, FileJson, FileSpreadsheet } from "lucide-react";
import { ScrumData, Entry, formatDate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";

interface DataIOProps {
  data: ScrumData;
  onImport: (data: ScrumData) => void;
}

function bulletsToMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("•")) return "- " + trimmed.slice(1).trim();
      return line;
    })
    .join("\n");
}

function entryToMarkdown(entry: Entry): string {
  const parts: string[] = [];
  if (entry.done.trim()) parts.push(`**What I did:**\n${bulletsToMarkdown(entry.done)}`);
  if (entry.doing.trim()) parts.push(`**What I'm doing next:**\n${bulletsToMarkdown(entry.doing)}`);
  if (entry.blockers.trim()) parts.push(`**Blockers:**\n${bulletsToMarkdown(entry.blockers)}`);
  if (entry.hours > 0) parts.push(`**Hours:** ${entry.hours.toFixed(1)}h`);
  return parts.join("\n\n");
}

function generateMarkdown(data: ScrumData, projects: string[], from: string, to: string): string {
  const sections: string[] = [];
  for (const project of projects) {
    const pe = data.entries[project];
    if (!pe) continue;
    const filtered = Object.values(pe)
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (filtered.length === 0) continue;
    sections.push(`# ${project}\n`);
    for (const entry of filtered) {
      const content = entryToMarkdown(entry);
      if (content) sections.push(`## ${entry.date}\n\n${content}\n`);
    }
  }
  return sections.length === 0 ? "No entries found for the selected period and projects." : sections.join("\n");
}

function generateExcelBuffer(data: ScrumData, projects: string[], from: string, to: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const project of projects) {
    const pe = data.entries[project];
    if (!pe) continue;
    const rows = Object.values(pe)
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        Date: e.date,
        Done: e.done.replace(/•/g, "-"),
        Doing: e.doing.replace(/•/g, "-"),
        Blockers: e.blockers.replace(/•/g, "-"),
        Hours: e.hours,
      }));
    if (rows.length === 0) continue;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 30 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, project.slice(0, 31));
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

function generateJSON(data: ScrumData, projects: string[], from: string, to: string): string {
  const filtered: ScrumData = { projects, entries: {} };
  for (const project of projects) {
    const pe = data.entries[project];
    if (!pe) continue;
    const entries: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(pe)) {
      if (e.date >= from && e.date <= to) entries[id] = e;
    }
    if (Object.keys(entries).length > 0) filtered.entries[project] = entries;
  }
  return JSON.stringify(filtered, null, 2);
}

function parseCSVImport(text: string): ScrumData | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const dateIdx = headers.indexOf("date");
  const doneIdx = headers.indexOf("done");
  const doingIdx = headers.indexOf("doing");
  const blockersIdx = headers.indexOf("blockers");
  const hoursIdx = headers.indexOf("hours");
  const projectIdx = headers.indexOf("project");
  if (dateIdx === -1) return null;

  const projects = new Set<string>();
  const entries: Record<string, Record<string, Entry>> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const project = projectIdx >= 0 ? cols[projectIdx] || "Imported" : "Imported";
    const date = cols[dateIdx] || "";
    if (!date) continue;
    projects.add(project);
    if (!entries[project]) entries[project] = {};
    const id = crypto.randomUUID();
    const hours = hoursIdx >= 0 ? parseFloat(cols[hoursIdx]) || 0 : 0;
    entries[project][id] = {
      id,
      date,
      done: doneIdx >= 0 ? cols[doneIdx] || "" : "",
      doing: doingIdx >= 0 ? cols[doingIdx] || "" : "",
      blockers: blockersIdx >= 0 ? cols[blockersIdx] || "" : "",
      hours,
    };
  }
  return { projects: [...projects], entries };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataIO({ data, onImport }: DataIOProps) {
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<"md" | "json" | "xlsx">("md");

  const today = formatDate(new Date());
  const thirtyDaysAgo = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const openExportDialog = (format: "md" | "json" | "xlsx") => {
    setExportFormat(format);
    setDateFrom(thirtyDaysAgo);
    setDateTo(today);
    setSelectedProjects([...data.projects]);
    setShowExport(true);
  };

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const handleExport = () => {
    if (selectedProjects.length === 0) {
      toast.error("Select at least one project");
      return;
    }
    if (exportFormat === "md") {
      const md = generateMarkdown(data, selectedProjects, dateFrom, dateTo);
      downloadBlob(new Blob([md], { type: "text/markdown" }), `scrum-log-${dateFrom}_${dateTo}.md`);
      toast.success("Exported as Markdown");
    } else if (exportFormat === "json") {
      const json = generateJSON(data, selectedProjects, dateFrom, dateTo);
      downloadBlob(new Blob([json], { type: "application/json" }), `scrum-log-${dateFrom}_${dateTo}.json`);
      toast.success("Exported as JSON");
    } else {
      const buf = generateExcelBuffer(data, selectedProjects, dateFrom, dateTo);
      downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `scrum-log-${dateFrom}_${dateTo}.xlsx`);
      toast.success("Exported as Excel");
    }
    setShowExport(false);
  };

  const handleJSONImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as ScrumData;
        if (!parsed.projects || !parsed.entries) {
          toast.error("Invalid JSON format");
          return;
        }
        onImport(parsed);
        toast.success(`Imported ${parsed.projects.length} projects`);
      } catch {
        toast.error("Failed to parse JSON");
      }
    };
    reader.readAsText(file);
    if (jsonFileRef.current) jsonFileRef.current.value = "";
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parseCSVImport(ev.target?.result as string);
        if (!result || result.projects.length === 0) {
          toast.error("No valid data found. CSV needs at least a 'date' column.");
          return;
        }
        onImport(result);
        toast.success(`Imported ${result.projects.length} project(s) from CSV`);
      } catch {
        toast.error("Failed to parse CSV");
      }
    };
    reader.readAsText(file);
    if (csvFileRef.current) csvFileRef.current.value = "";
  };

  const [showImport, setShowImport] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processImportFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImportFile(file);
    e.target.value = "";
  };

  const processImportFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        if (ext === "json") {
          const parsed = JSON.parse(content) as ScrumData;
          if (!parsed.projects || !parsed.entries) {
            toast.error("Invalid JSON — needs 'projects' and 'entries' keys");
            return;
          }
          onImport(parsed);
          toast.success(`Imported ${parsed.projects.length} project(s) from JSON`);
        } else if (ext === "csv") {
          const result = parseCSVImport(content);
          if (!result || result.projects.length === 0) {
            toast.error("No valid data. CSV needs at least a 'date' column.");
            return;
          }
          onImport(result);
          toast.success(`Imported ${result.projects.length} project(s) from CSV`);
        } else {
          toast.error("Unsupported file type — use .json or .csv");
        }
      } catch {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsText(file);
    setShowImport(false);
  };

  const formatLabels = { md: "Markdown", json: "JSON", xlsx: "Excel" };
  const importFileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground gap-1 text-xs">
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openExportDialog("md")}>
              <FileText className="w-4 h-4 mr-2" /> Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openExportDialog("json")}>
              <FileJson className="w-4 h-4 mr-2" /> JSON (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openExportDialog("xlsx")}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground gap-1 text-xs"
          onClick={() => setShowImport(true)}
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </Button>
      </div>

      {/* ── IMPORT DIALOG ── */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Import Data
            </DialogTitle>
          </DialogHeader>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => importFileRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border/50 hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <Upload className={cn("w-8 h-8 mx-auto mb-3 transition-colors", isDragging ? "text-primary" : "text-muted-foreground/40")} />
            <p className="text-sm font-medium text-foreground">
              {isDragging ? "Drop your file here" : "Drag & drop a file, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports <span className="font-semibold text-foreground">.json</span> and{" "}
              <span className="font-semibold text-foreground">.csv</span> files
            </p>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Format guides */}
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="rounded-md bg-muted/30 p-3 space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-primary" />
                JSON format
              </p>
              <p>
                Export from this app using <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">Export → JSON</span>, then re-import it here. The file needs{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">projects</span> and{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">entries</span> keys.
              </p>
            </div>
            <div className="rounded-md bg-muted/30 p-3 space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                CSV format
              </p>
              <p>
                A spreadsheet with columns: <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">date</span> (required),{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">done</span>,{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">doing</span>,{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">blockers</span>,{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">hours</span>,{" "}
                <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">project</span>.
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Only <span className="font-semibold">date</span> is required. Missing columns are imported as empty.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EXPORT DIALOG ── */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export as {formatLabels[exportFormat]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Projects</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {data.projects.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selectedProjects.includes(p)} onCheckedChange={() => toggleProject(p)} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>Cancel</Button>
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" />
              Export .{exportFormat}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
