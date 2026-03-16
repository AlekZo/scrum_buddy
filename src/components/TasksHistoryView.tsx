import { useMemo, useState, useCallback, useEffect } from "react";
import { Entry } from "@/lib/types";
import { parseTasks, taskSimilarity } from "@/lib/task-parser";
import { isAIConfigured, AIError, getAISettings } from "@/lib/ai-service";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Search, CalendarDays, ChevronDown, ChevronRight,
  Sparkles, Unlink, Link, Loader2, CheckCircle2, ListTodo, AlertTriangle,
  EyeOff, Eye, X, ChevronsUpDown, ChevronsDownUp, RotateCcw,
  LayoutList, Calendar, List, Clock, Users, BarChart3, Activity, MessageSquare,
} from "lucide-react";
import { TimelineView, ActivityView } from "@/components/TaskAnalysisViews";
import { TaskJustifyDialog } from "@/components/TaskJustifyDialog";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePresentationMode } from "@/lib/presentation-mode";
import { stripAllHours } from "@/lib/text-sanitizer";

// ── Types ──────────────────────────────────────────────

interface TaskOccurrence {
  date: string;
  text: string;         // full original text
  childText: string;    // text after removing group prefix
  actualHours: number;
  teamHours: number;
  source: "done" | "doing";
}

interface TaskGroup {
  id: string;
  name: string;
  method: "delimiter" | "lcp" | "similarity" | "ai" | "single";
  occurrences: TaskOccurrence[];
  subGroups?: TaskGroup[];
  totalActual: number;
  totalTeam: number;
  lastSeen: string;
}

interface TasksHistoryViewProps {
  entries: Entry[];
  project: string;
}

// ── Hidden tasks persistence ───────────────────────────
const HIDDEN_TASKS_KEY = "tasks-hidden";

function getHiddenTasks(project: string): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_TASKS_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw);
    return new Set(data[project] || []);
  } catch { return new Set(); }
}

function saveHiddenTasks(project: string, hidden: Set<string>) {
  try {
    const raw = localStorage.getItem(HIDDEN_TASKS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[project] = [...hidden];
    localStorage.setItem(HIDDEN_TASKS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

type FilterPreset = "thisWeek" | "lastWeek" | "thisMonth" | "last30" | "all" | "custom";

function getFilterRange(preset: FilterPreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (preset) {
    case "thisWeek": {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "lastWeek": {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff - 7);
      const from = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 6);
      return { from, to: d.toISOString().slice(0, 10) };
    }
    case "thisMonth": {
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return { from, to: today };
    }
    case "last30": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "custom":
      return { from: customFrom || "2000-01-01", to: customTo || today };
    case "all":
    default:
      return { from: "2000-01-01", to: today };
  }
}

// ── Grouping helpers ───────────────────────────────────

/** Split by common delimiters: " - ", " — ", " : " */
function splitByDelimiter(text: string): { parent: string; child: string } | null {
  const delimiters = [" - ", " — ", " – ", ": "];
  for (const d of delimiters) {
    const idx = text.indexOf(d);
    if (idx > 2) { // parent must be at least 3 chars
      return { parent: text.slice(0, idx).trim(), child: text.slice(idx + d.length).trim() };
    }
  }
  return null;
}

/** Find longest common prefix (in words) between two strings, min 3 words */
function longestCommonPrefixWords(a: string, b: string): string | null {
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  const len = Math.min(wa.length, wb.length);
  let common = 0;
  for (let i = 0; i < len; i++) {
    if (wa[i].toLowerCase() === wb[i].toLowerCase()) common++;
    else break;
  }
  if (common >= 3) return wa.slice(0, common).join(" ");
  return null;
}

/** Recursively sub-group occurrences by delimiter, up to maxDepth levels */
function buildSubGroups(occurrences: TaskOccurrence[], depth: number, maxDepth: number): TaskGroup[] | undefined {
  if (depth >= maxDepth || occurrences.length <= 1) return undefined;

  const subMap = new Map<string, { displayName: string; items: TaskOccurrence[] }>();
  const noSub: TaskOccurrence[] = [];

  for (const occ of occurrences) {
    const split = splitByDelimiter(occ.childText);
    if (split) {
      const key = split.parent.toLowerCase();
      if (!subMap.has(key)) subMap.set(key, { displayName: split.parent, items: [] });
      subMap.get(key)!.items.push({ ...occ, childText: split.child });
    } else {
      noSub.push(occ);
    }
  }

  if (subMap.size === 0) return undefined;

  // Merge orphan items into matching sub-groups when their childText matches a sub-group name
  const remainingNoSub: TaskOccurrence[] = [];
  for (const occ of noSub) {
    const key = occ.childText.toLowerCase().trim();
    if (subMap.has(key)) {
      // This orphan's text matches a sub-group name — add it as an occurrence with empty leaf text
      subMap.get(key)!.items.push({ ...occ, childText: occ.childText });
    } else {
      remainingNoSub.push(occ);
    }
  }

  const groups: TaskGroup[] = [];
  for (const [, { displayName, items }] of subMap) {
    items.sort((a, b) => b.date.localeCompare(a.date));
    const group = makeGroup(displayName, items, "delimiter");
    group.subGroups = buildSubGroups(items, depth + 1, maxDepth);
    groups.push(group);
  }

  for (const occ of remainingNoSub) {
    groups.push(makeGroup(occ.childText, [occ], "single"));
  }

  groups.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return groups;
}

/** Build groups using delimiter split + LCP fallback */
function buildGroups(
  occurrences: TaskOccurrence[],
  unlinked: Set<string>
): TaskGroup[] {
  // Phase 1: Delimiter grouping
  const delimiterGroups = new Map<string, TaskOccurrence[]>();
  const noDelimiter: TaskOccurrence[] = [];

  for (const occ of occurrences) {
    const occKey = `${occ.date}::${occ.text}`;
    if (unlinked.has(occKey)) {
      noDelimiter.push({ ...occ, childText: occ.text });
      continue;
    }
    const split = splitByDelimiter(occ.text);
    if (split) {
      const key = split.parent.toLowerCase();
      if (!delimiterGroups.has(key)) delimiterGroups.set(key, []);
      delimiterGroups.get(key)!.push({ ...occ, childText: split.child });
    } else {
      noDelimiter.push({ ...occ, childText: occ.text });
    }
  }

  const groups: TaskGroup[] = [];

  // Convert delimiter groups with recursive sub-grouping (2 additional levels)
  for (const [, items] of delimiterGroups) {
    items.sort((a, b) => b.date.localeCompare(a.date));
    const split = splitByDelimiter(items[0].text);
    const name = split?.parent || items[0].text;
    const group = makeGroup(name, items, "delimiter");
    // Try to build sub-groups (up to 2 more levels deep)
    group.subGroups = buildSubGroups(items, 0, 2);
    groups.push(group);
  }

  // Phase 2: LCP grouping on remaining tasks
  const lcpAssigned = new Set<number>();
  for (let i = 0; i < noDelimiter.length; i++) {
    if (lcpAssigned.has(i)) continue;
    const cluster: TaskOccurrence[] = [noDelimiter[i]];
    let groupName: string | null = null;

    for (let j = i + 1; j < noDelimiter.length; j++) {
      if (lcpAssigned.has(j)) continue;
      const lcp = longestCommonPrefixWords(noDelimiter[i].text, noDelimiter[j].text);
      if (lcp) {
        if (!groupName) groupName = lcp;
        lcpAssigned.add(j);
        const child = noDelimiter[j].text.slice(lcp.length).replace(/^[\s\-–—:]+/, "").trim();
        cluster.push({ ...noDelimiter[j], childText: child || noDelimiter[j].text });
      }
    }

    if (groupName && cluster.length > 1) {
      lcpAssigned.add(i);
      cluster[0] = {
        ...cluster[0],
        childText: cluster[0].text.slice(groupName.length).replace(/^[\s\-–—:]+/, "").trim() || cluster[0].text,
      };
      cluster.sort((a, b) => b.date.localeCompare(a.date));
      groups.push(makeGroup(groupName, cluster, "lcp"));
    }
  }

  // Phase 3: Similarity grouping on remaining ungrouped
  const remaining = noDelimiter.filter((_, i) => !lcpAssigned.has(i));
  const simAssigned = new Set<number>();
  for (let i = 0; i < remaining.length; i++) {
    if (simAssigned.has(i)) continue;
    simAssigned.add(i);
    const cluster: TaskOccurrence[] = [remaining[i]];
    for (let j = i + 1; j < remaining.length; j++) {
      if (simAssigned.has(j)) continue;
      if (taskSimilarity(remaining[i].text, remaining[j].text) >= 0.6) {
        simAssigned.add(j);
        cluster.push(remaining[j]);
      }
    }
    cluster.sort((a, b) => b.date.localeCompare(a.date));
    const method = cluster.length > 1 ? "similarity" : "single";
    groups.push(makeGroup(cluster[0].text, cluster, method));
  }

  groups.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return groups;
}

function makeGroup(name: string, occs: TaskOccurrence[], method: TaskGroup["method"]): TaskGroup {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-").slice(0, 60),
    name,
    method,
    occurrences: occs,
    totalActual: occs.reduce((s, o) => s + o.actualHours, 0),
    totalTeam: occs.reduce((s, o) => s + o.teamHours, 0),
    lastSeen: occs[0]?.date || "",
  };
}

// ── Sub-components for nested rendering ────────────────

interface OccurrenceListProps {
  occurrences: TaskOccurrence[];
  groupId: string;
  isMulti: boolean;
  expandedContext: string | null;
  toggleContext: (key: string) => void;
  getEntryForDate: (date: string) => Entry | undefined;
  handleUnlink: (occ: TaskOccurrence) => void;
  handleRelink: (occ: TaskOccurrence) => void;
  unlinked: Set<string>;
  formatDate: (dateStr: string) => string;
  t: (key: string) => string;
  indentLevel?: number;
  showActual?: boolean;
  showTeam?: boolean;
}

function OccurrenceList({
  occurrences, groupId, isMulti, expandedContext, toggleContext,
  getEntryForDate, handleUnlink, handleRelink, unlinked, formatDate, t, indentLevel = 0,
  showActual = true, showTeam = true,
}: OccurrenceListProps) {
  const { presentationMode } = usePresentationMode();
  const pl = indentLevel > 0 ? `pl-${4 + indentLevel * 4}` : "pl-4";
  return (
    <>
      {occurrences.map((occ, i) => {
        const contextKey = `${groupId}::${occ.date}::${i}`;
        const isContextOpen = expandedContext === contextKey;
        const entry = isContextOpen ? getEntryForDate(occ.date) : undefined;
        const displayText = occ.childText && occ.childText !== occ.text
          ? occ.childText : occ.text;

        return (
          <div key={contextKey}>
            <div
              className={cn(
                "flex items-center gap-2 pr-4 py-2 text-xs cursor-pointer hover:bg-muted/20 transition-colors",
                i > 0 && "border-t border-border/20",
                pl
              )}
              style={indentLevel > 0 ? { paddingLeft: `${1 + indentLevel * 1}rem` } : undefined}
              onClick={() => toggleContext(contextKey)}
            >
              <span className="font-mono text-muted-foreground whitespace-nowrap w-24 shrink-0">
                {formatDate(occ.date)}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1 font-mono truncate text-foreground">{displayText}</span>
                </TooltipTrigger>
                {displayText !== occ.text && (
                  <TooltipContent side="top" className="text-xs max-w-sm">{occ.text}</TooltipContent>
                )}
              </Tooltip>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                occ.source === "done"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              )}>
                {occ.source === "done" ? t("tasks.done") : t("tasks.doing")}
              </span>
              {showActual && (
                <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                  {occ.actualHours > 0 ? `${occ.actualHours.toFixed(1)}h` : "–"}
                </span>
              )}
              {showTeam && (
                <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                  {occ.teamHours > 0 ? `${occ.teamHours.toFixed(1)}h` : "–"}
                </span>
              )}
              {(() => {
                const occKey = `${occ.date}::${occ.text}`;
                const isUnlinked = unlinked.has(occKey);
                if (isUnlinked) {
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleRelink(occ); }}
                        >
                          <Link className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Re-link to group</TooltipContent>
                    </Tooltip>
                  );
                }
                if (isMulti) {
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleUnlink(occ); }}
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Remove from group</TooltipContent>
                    </Tooltip>
                  );
                }
                return null;
              })()}
            </div>
            {isContextOpen && entry && (
              <div className="mx-4 mb-2 rounded-lg bg-muted/30 border border-border/40 p-3 space-y-2.5 text-xs animate-in slide-in-from-top-1 duration-200">
                {entry.done && (
                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
                      <CheckCircle2 className="w-3 h-3" />{t("tasks.whatIDid")}
                    </div>
                    <div className="font-mono text-foreground/80 whitespace-pre-line pl-4 leading-relaxed">{presentationMode ? stripAllHours(entry.done) : entry.done}</div>
                  </div>
                )}
                {entry.doing && (
                  <div>
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold mb-1">
                      <ListTodo className="w-3 h-3" />{t("tasks.whatImDoing")}
                    </div>
                    <div className="font-mono text-foreground/80 whitespace-pre-line pl-4 leading-relaxed">{presentationMode ? stripAllHours(entry.doing) : entry.doing}</div>
                  </div>
                )}
                {entry.blockers && (
                  <div>
                    <div className="flex items-center gap-1.5 text-destructive font-semibold mb-1">
                      <AlertTriangle className="w-3 h-3" />{t("tasks.blockers")}
                    </div>
                    <div className="font-mono text-foreground/80 whitespace-pre-line pl-4 leading-relaxed">{presentationMode ? stripAllHours(entry.blockers) : entry.blockers}</div>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                  {t("tasks.fullLog")} {formatDate(entry.date)}
                  {entry.reported && <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">{t("tasks.reported")}</Badge>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

interface SubGroupListProps {
  subGroups: TaskGroup[];
  depth: number;
  expandedTasks: Set<string>;
  toggleExpanded: (id: string) => void;
  expandedContext: string | null;
  toggleContext: (key: string) => void;
  getEntryForDate: (date: string) => Entry | undefined;
  handleUnlink: (occ: TaskOccurrence) => void;
  handleRelink: (occ: TaskOccurrence) => void;
  unlinked: Set<string>;
  formatDate: (dateStr: string) => string;
  methodIcon: (method: TaskGroup["method"]) => string | null;
  t: (key: string) => string;
  parentId: string;
  showActual?: boolean;
  showTeam?: boolean;
}

function SubGroupList({
  subGroups, depth, expandedTasks, toggleExpanded, expandedContext,
  toggleContext, getEntryForDate, handleUnlink, handleRelink, unlinked, formatDate, methodIcon, t, parentId,
  showActual = true, showTeam = true,
}: SubGroupListProps) {
  return (
    <div className={cn(depth > 1 && "border-l-2 border-border/30 ml-3")}>
      {subGroups.map((sub) => {
        const subId = `${parentId}__${sub.id}`;
        const isSubExpanded = expandedTasks.has(subId);
        const hasDual = sub.totalActual !== sub.totalTeam && sub.totalActual > 0;
        const hasSubSubs = sub.subGroups && sub.subGroups.length > 0;

        return (
          <div key={subId} className={cn("border-t border-border/30", depth === 1 && "")}>
            {/* Sub-group header */}
            <button
              className={cn(
                "w-full text-left py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors text-xs",
              )}
              style={{ paddingLeft: `${0.75 + depth * 0.75}rem`, paddingRight: "1rem" }}
              onClick={() => toggleExpanded(subId)}
            >
              {isSubExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 font-medium truncate text-foreground/90">
                {sub.name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-1">
                <CalendarDays className="w-2.5 h-2.5" />
                {sub.occurrences.length}×
              </Badge>
              {(showActual && sub.totalActual > 0) || (showTeam && sub.totalTeam > 0) ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                  {[
                    showActual && `${sub.totalActual.toFixed(1)}h`,
                    showTeam && `${sub.totalTeam.toFixed(1)}h`,
                  ].filter(Boolean).join(" / ")}
                </Badge>
              ) : null}
            </button>

            {/* Sub-group expanded content */}
            {isSubExpanded && (
              <div>
                {hasSubSubs ? (
                  <SubGroupList
                    subGroups={sub.subGroups!}
                    depth={depth + 1}
                    expandedTasks={expandedTasks}
                    toggleExpanded={toggleExpanded}
                    expandedContext={expandedContext}
                    toggleContext={toggleContext}
                    getEntryForDate={getEntryForDate}
                    handleUnlink={handleUnlink}
                    handleRelink={handleRelink}
                    unlinked={unlinked}
                    formatDate={formatDate}
                    methodIcon={methodIcon}
                    t={t}
                    parentId={subId}
                    showActual={showActual}
                    showTeam={showTeam}
                  />
                ) : (
                  <OccurrenceList
                    occurrences={sub.occurrences}
                    groupId={subId}
                    isMulti={sub.occurrences.length > 1}
                    expandedContext={expandedContext}
                    toggleContext={toggleContext}
                    getEntryForDate={getEntryForDate}
                    handleUnlink={handleUnlink}
                    handleRelink={handleRelink}
                    unlinked={unlinked}
                    formatDate={formatDate}
                    t={t}
                    indentLevel={depth}
                    showActual={showActual}
                    showTeam={showTeam}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ──────────────────────────────────────────

export function TasksHistoryView({ entries, project }: TasksHistoryViewProps) {
  const { t } = useI18n();
  const { presentationMode } = usePresentationMode();
  const [search, setSearch] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedContext, setExpandedContext] = useState<string | null>(null); // "groupId::date::idx"
  const [unlinked, setUnlinked] = useState<Set<string>>(new Set());
  const [aiGrouping, setAiGrouping] = useState(false);
  const [aiGroups, setAiGroups] = useState<Map<string, string> | null>(null);
  const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(() => getHiddenTasks(project));
  const [showHidden, setShowHidden] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [viewMode, setViewMode] = useState<"tasks" | "dates" | "flat" | "timeline" | "activity">("tasks");
  const [showActual, setShowActual] = useState(true);
  const [showTeam, setShowTeam] = useState(true);

  // In presentation mode, override hour visibility
  const effectiveShowActual = presentationMode ? false : showActual;
  const effectiveShowTeam = presentationMode ? false : showTeam;
  const [justifyOpen, setJustifyOpen] = useState(false);
  const [justifyGroupId, setJustifyGroupId] = useState<string | null>(null);

  // Keep hidden-task state scoped to current project
  useEffect(() => {
    setHiddenTasks(getHiddenTasks(project));
    setShowHidden(false);
  }, [project]);

  // Compute filter date range
  const dateRange = useMemo(
    () => getFilterRange(filterPreset, customFrom, customTo),
    [filterPreset, customFrom, customTo]
  );

  // Build all occurrences with date filtering
  const allOccurrences = useMemo(() => {
    const result: TaskOccurrence[] = [];
    for (const entry of entries) {
      if (entry.date < dateRange.from || entry.date > dateRange.to) continue;
      for (const t of [...parseTasks(entry.done, "done"), ...parseTasks(entry.doing, "doing")]) {
        if (!t.text.trim()) continue;
        result.push({
          date: entry.date,
          text: t.text,
          childText: t.text,
          actualHours: t.actualHours,
          teamHours: t.teamHours,
          source: t.source,
        });
      }
    }
    return result;
  }, [entries, dateRange, customFrom, customTo]);

  // Build groups with current unlinked state
  const taskGroups = useMemo(
    () => buildGroups(allOccurrences, unlinked),
    [allOccurrences, unlinked]
  );

  // Filter by search + hidden
  const filtered = useMemo(() => {
    let groups = taskGroups;
    if (!showHidden) {
      groups = groups.filter((g) => !hiddenTasks.has(g.name.toLowerCase()));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      groups = groups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.occurrences.some((o) => o.text.toLowerCase().includes(q))
      );
    }
    return groups;
  }, [taskGroups, search, hiddenTasks, showHidden]);

  // Build date-grouped view: group all occurrences by date, with task group info
  const dateGroups = useMemo(() => {
    if (viewMode !== "dates") return [];
    // Build a lookup: occurrence key → group name
    const occGroupMap = new Map<string, string>();
    for (const g of taskGroups) {
      for (const occ of g.occurrences) {
        occGroupMap.set(`${occ.date}::${occ.text}`, g.name);
      }
    }

    const byDate = new Map<string, { occ: TaskOccurrence; groupName: string }[]>();
    const q = search.trim().toLowerCase();
    for (const occ of allOccurrences) {
      if (q && !occ.text.toLowerCase().includes(q)) continue;
      const groupName = occGroupMap.get(`${occ.date}::${occ.text}`) || "";
      if (!showHidden && groupName && hiddenTasks.has(groupName.toLowerCase())) continue;
      if (!byDate.has(occ.date)) byDate.set(occ.date, []);
      byDate.get(occ.date)!.push({ occ, groupName });
    }

    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items,
        totalActual: items.reduce((s, i) => s + i.occ.actualHours, 0),
        totalTeam: items.reduce((s, i) => s + i.occ.teamHours, 0),
      }));
  }, [viewMode, taskGroups, allOccurrences, search, hiddenTasks, showHidden]);

  const hiddenCount = useMemo(
    () => taskGroups.filter((g) => hiddenTasks.has(g.name.toLowerCase())).length,
    [taskGroups, hiddenTasks]
  );

  const toggleExpanded = (id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleContext = (key: string) => {
    setExpandedContext((prev) => (prev === key ? null : key));
  };

  const handleUnlink = useCallback((occ: TaskOccurrence) => {
    setUnlinked((prev) => {
      const next = new Set(prev);
      next.add(`${occ.date}::${occ.text}`);
      return next;
    });
    toast.info("Task removed from group");
  }, []);

  const handleRelink = useCallback((occ: TaskOccurrence) => {
    setUnlinked((prev) => {
      const next = new Set(prev);
      next.delete(`${occ.date}::${occ.text}`);
      return next;
    });
    toast.info("Task re-linked to group");
  }, []);

  const handleResetUnlinks = useCallback(() => {
    setUnlinked(new Set());
    toast.success("All unlinks reset");
  }, []);

  const handleHideTask = useCallback((groupName: string) => {
    setHiddenTasks((prev) => {
      const next = new Set(prev);
      next.add(groupName.toLowerCase());
      saveHiddenTasks(project, next);
      return next;
    });
    toast.info("Task hidden — toggle 'Show hidden' to bring it back");
  }, [project]);

  const handleUnhideTask = useCallback((groupName: string) => {
    setHiddenTasks((prev) => {
      const next = new Set(prev);
      next.delete(groupName.toLowerCase());
      saveHiddenTasks(project, next);
      return next;
    });
  }, [project]);

  const handleUnhideAll = useCallback(() => {
    setHiddenTasks(new Set());
    saveHiddenTasks(project, new Set());
    toast.success("All tasks unhidden");
  }, [project]);

  // Get entry context for standup drawer
  const getEntryForDate = useCallback(
    (date: string): Entry | undefined => entries.find((e) => e.date === date),
    [entries]
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  // AI clustering
  const handleAIClustering = async () => {
    if (!isAIConfigured()) {
      toast.error("AI is not configured. Set it up in Settings.");
      return;
    }
    setAiGrouping(true);
    try {
      const settings = getAISettings();
      if (!settings) throw new Error("AI not configured");
      const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";

      const uniqueTasks = [...new Set(allOccurrences.map((o) => o.text))];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            {
              role: "system",
              content:
                "You group related tasks by semantic meaning. Return a JSON object where keys are group names " +
                "and values are arrays of exact task strings that belong to that group. " +
                "Group names should be concise (2-5 words). Tasks that don't fit anywhere go under 'Other'. " +
                "Preserve the original language of task names. Return ONLY valid JSON, no markdown fences.",
            },
            {
              role: "user",
              content: `Group these tasks semantically:\n${uniqueTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 4000,
        }),
      });
      if (!res.ok) throw new Error(`AI error: ${res.status}`);
      const data = await res.json();
      const result = data.choices?.[0]?.message?.content || "";

      const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned) as Record<string, string[]>;
      const map = new Map<string, string>();
      for (const [group, tasks] of Object.entries(parsed)) {
        for (const task of tasks) {
          map.set(task.toLowerCase(), group);
        }
      }
      setAiGroups(map);
      toast.success(`AI grouped tasks into ${Object.keys(parsed).length} categories`);
    } catch (err) {
      if (err instanceof AIError && err.provider !== "ollama") {
        toast.error(err.message, { description: "💡 Tip: Try switching to Ollama (local) in Settings → AI", duration: 8000 });
      } else {
        toast.error(err instanceof Error ? err.message : "AI clustering failed");
      }
    } finally {
      setAiGrouping(false);
    }
  };

  const handleUndoAIGrouping = useCallback(() => {
    setAiGroups(null);
    toast.info("AI grouping undone");
  }, []);

  // Stats
  const totalTasks = filtered.reduce((s, g) => s + g.occurrences.length, 0);
  const groupedCount = filtered.filter((g) => g.occurrences.length > 1).length;

  // Collect all expandable IDs (groups + sub-groups recursively)
  const collectAllIds = useCallback((groups: TaskGroup[], parentId?: string): string[] => {
    const ids: string[] = [];
    for (const g of groups) {
      const id = parentId ? `${parentId}__${g.id}` : g.id;
      ids.push(id);
      if (g.subGroups) ids.push(...collectAllIds(g.subGroups, id));
    }
    return ids;
  }, []);

  const handleExpandAll = useCallback(() => {
    if (viewMode === "dates") {
      setExpandedTasks(new Set(dateGroups.map((dg) => `date-${dg.date}`)));
    } else {
      const allIds = collectAllIds(filtered);
      setExpandedTasks(new Set(allIds));
    }
  }, [filtered, collectAllIds, viewMode, dateGroups]);

  const handleCollapseAll = useCallback(() => {
    setExpandedTasks(new Set());
  }, []);

  const methodIcon = (method: TaskGroup["method"]) => {
    switch (method) {
      case "delimiter": return "⚡";
      case "lcp": return "🔗";
      case "similarity": return "≈";
      case "ai": return "✨";
      default: return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Search + filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border rounded-md overflow-hidden shrink-0">
            {([
              { key: "tasks" as const, icon: LayoutList, label: "Tasks" },
              { key: "dates" as const, icon: Calendar, label: "Dates" },
              { key: "flat" as const, icon: List, label: "Flat" },
              { key: "timeline" as const, icon: BarChart3, label: "Timeline" },
              { key: "activity" as const, icon: Activity, label: "Activity" },
            ]).map((v, i) => (
              <button
                key={v.key}
                className={cn(
                  "h-9 px-2 text-xs flex items-center gap-1 transition-colors",
                  i > 0 && "border-l",
                  viewMode === v.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                onClick={() => setViewMode(v.key)}
              >
                <v.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Hour column toggles */}
          {!presentationMode && (
          <div className="flex items-center border rounded-md overflow-hidden shrink-0">
            <button
              className={cn(
                "h-9 px-2 text-xs flex items-center gap-1 transition-colors",
                showActual ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}
              onClick={() => setShowActual(!showActual)}
              title="Toggle Actual hours"
            >
              <Clock className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Actual</span>
            </button>
            <button
              className={cn(
                "h-9 px-2 text-xs flex items-center gap-1 transition-colors border-l",
                showTeam ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}
              onClick={() => setShowTeam(!showTeam)}
              title="Toggle Team hours"
            >
              <Users className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Team</span>
            </button>
          </div>
          )}

          {isAIConfigured() && viewMode === "tasks" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 text-xs shrink-0"
                onClick={handleAIClustering}
                disabled={aiGrouping}
              >
                {aiGrouping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                AI Group
              </Button>
              {aiGroups && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs px-2 shrink-0"
                  onClick={handleUndoAIGrouping}
                >
                  Undo
                </Button>
              )}
            </>
          )}
          {isAIConfigured() && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 text-xs shrink-0"
                onClick={() => { setJustifyGroupId(null); setJustifyOpen(true); }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ask AI
              </Button>
              <TaskJustifyDialog
                groups={filtered}
                allOccurrences={allOccurrences}
                open={justifyOpen}
                onOpenChange={setJustifyOpen}
                initialGroupId={justifyGroupId}
              />
            </>
          )}
        </div>

        {/* Filter presets row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "thisWeek" as FilterPreset, label: t("timesheet.thisWeek") },
            { key: "lastWeek" as FilterPreset, label: t("timesheet.lastWeek") },
            { key: "thisMonth" as FilterPreset, label: t("timesheet.thisMonth") },
            { key: "last30" as FilterPreset, label: t("timesheet.last30") },
            { key: "all" as FilterPreset, label: t("timesheet.all") },
            { key: "custom" as FilterPreset, label: t("timesheet.custom") },
          ]).map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={filterPreset === p.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilterPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
          {filterPreset === "custom" && (
            <div className="flex items-center gap-1.5 ml-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-7 text-xs w-32"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-7 text-xs w-32"
              />
            </div>
          )}
        </div>
        {/* Stats + hidden toggle */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{filtered.length} groups</span>
          <span>·</span>
          <span>{totalTasks} entries</span>
          {groupedCount > 0 && (
            <>
              <span>·</span>
              <span>{groupedCount} auto-grouped</span>
            </>
          )}
          {unlinked.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={handleResetUnlinks}>
              <RotateCcw className="w-3 h-3" /> Reset {unlinked.size} unlink{unlinked.size > 1 ? "s" : ""}
            </Button>
          )}
          {filtered.length > 0 && (viewMode === "tasks" || viewMode === "dates") && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={handleExpandAll}>
                <ChevronsUpDown className="w-3 h-3" /> Expand
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={handleCollapseAll}>
                <ChevronsDownUp className="w-3 h-3" /> Collapse
              </Button>
            </>
          )}
          <div className="flex-1" />
          {hiddenCount > 0 && (
            <Button
              variant={showHidden ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-[11px] gap-1.5 px-2"
              onClick={() => setShowHidden(!showHidden)}
            >
              {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {hiddenCount} hidden
            </Button>
          )}
          {showHidden && hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={handleUnhideAll}
            >
              Unhide all
            </Button>
          )}
        </div>

        {/* Task list - Tasks view */}
        {viewMode === "tasks" && (
        <div className="space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search
                ? "No tasks matching your search"
                : hiddenCount > 0 && !showHidden
                  ? "No visible tasks — toggle hidden tasks on the right"
                  : "No tasks logged yet"}
            </div>
          )}

          {filtered.map((group) => {
            const isExpanded = expandedTasks.has(group.id);
            const hasDual = group.totalActual !== group.totalTeam && group.totalActual > 0;
            const isMulti = group.occurrences.length > 1;
            const mIcon = isMulti ? methodIcon(group.method) : null;
            const isHidden = hiddenTasks.has(group.name.toLowerCase());

            return (
              <Card key={group.id} className={cn("overflow-hidden group/row", isHidden && "opacity-50")}>
                {/* Group header */}
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpanded(group.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}

                  <span className="flex-1 text-sm font-medium truncate flex items-center gap-2">
                    {group.name}
                    {mIcon && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] opacity-60">{mIcon}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Grouped by {group.method}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {group.occurrences.length}×
                    </Badge>
                    {(effectiveShowActual && group.totalActual > 0) || (effectiveShowTeam && group.totalTeam > 0) ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                        {[
                          effectiveShowActual && `${group.totalActual.toFixed(1)}h`,
                          effectiveShowTeam && `${group.totalTeam.toFixed(1)}h`,
                        ].filter(Boolean).join(" / ")}
                      </Badge>
                    ) : null}
                    {isAIConfigured() && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/row:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setJustifyGroupId(group.id);
                              setJustifyOpen(true);
                            }}
                          >
                            <MessageSquare className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Ask AI about this task
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            isHidden ? handleUnhideTask(group.name) : handleHideTask(group.name);
                          }}
                        >
                          {isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {isHidden ? "Unhide task" : "Hide task"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </button>

                {/* Expanded rows */}
                {isExpanded && (
                  <div className="border-t border-border/50">
                    {group.subGroups && group.subGroups.length > 0 ? (
                      <SubGroupList
                        subGroups={group.subGroups}
                        depth={1}
                        expandedTasks={expandedTasks}
                        toggleExpanded={toggleExpanded}
                        expandedContext={expandedContext}
                        toggleContext={toggleContext}
                        getEntryForDate={getEntryForDate}
                        handleUnlink={handleUnlink}
                        handleRelink={handleRelink}
                        unlinked={unlinked}
                        formatDate={formatDate}
                        methodIcon={methodIcon}
                        t={t}
                        parentId={group.id}
                        showActual={effectiveShowActual}
                        showTeam={effectiveShowTeam}
                      />
                    ) : (
                      <OccurrenceList
                        occurrences={group.occurrences}
                        groupId={group.id}
                        isMulti={isMulti}
                        expandedContext={expandedContext}
                        toggleContext={toggleContext}
                        getEntryForDate={getEntryForDate}
                        handleUnlink={handleUnlink}
                        handleRelink={handleRelink}
                        unlinked={unlinked}
                        formatDate={formatDate}
                        t={t}
                        showActual={effectiveShowActual}
                        showTeam={effectiveShowTeam}
                      />
                    )}

                    {/* Group footer with column headers */}
                    <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-muted-foreground border-t border-border/30 bg-muted/10">
                      <span className="w-24 shrink-0">Date</span>
                      <span className="flex-1">Task</span>
                      <span className="shrink-0 w-14 text-center">Type</span>
                      {effectiveShowActual && <span className="w-12 text-right shrink-0">Actual</span>}
                      {effectiveShowTeam && <span className="w-12 text-right shrink-0">Team</span>}
                      {isMulti && <span className="w-7 shrink-0" />}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        )}

        {/* Task list - Dates view */}
        {viewMode === "dates" && (
          <div className="space-y-1.5">
            {dateGroups.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {search ? "No tasks matching your search" : "No tasks logged yet"}
              </div>
            )}

            {dateGroups.map((dg) => {
              const isExpanded = expandedTasks.has(`date-${dg.date}`);
              return (
                <Card key={dg.date} className="overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpanded(`date-${dg.date}`)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm font-medium">
                      {formatDate(dg.date)}
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{dg.date}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-1">
                        {dg.items.length} task{dg.items.length !== 1 ? "s" : ""}
                      </Badge>
                      {((effectiveShowActual && dg.totalActual > 0) || (effectiveShowTeam && dg.totalTeam > 0)) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                          {[
                            effectiveShowActual && `${dg.totalActual.toFixed(1)}h`,
                            effectiveShowTeam && `${dg.totalTeam.toFixed(1)}h`,
                          ].filter(Boolean).join(" / ")}
                        </Badge>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50">
                      {dg.items.map((item, i) => (
                        <div
                          key={`${dg.date}::${item.occ.text}::${i}`}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/20 transition-colors",
                            i > 0 && "border-t border-border/20"
                          )}
                        >
                          {item.groupName && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 max-w-[160px] truncate">
                              {item.groupName}
                            </Badge>
                          )}
                          <span className="flex-1 font-mono truncate text-foreground">
                            {item.occ.text}
                          </span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                            item.occ.source === "done"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          )}>
                            {item.occ.source === "done" ? t("tasks.done") : t("tasks.doing")}
                          </span>
                          {effectiveShowActual && (
                            <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                              {item.occ.actualHours > 0 ? `${item.occ.actualHours.toFixed(1)}h` : "–"}
                            </span>
                          )}
                          {effectiveShowTeam && (
                            <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                              {item.occ.teamHours > 0 ? `${item.occ.teamHours.toFixed(1)}h` : "–"}
                            </span>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-muted-foreground border-t border-border/30 bg-muted/10">
                        <span className="flex-1">Group / Task</span>
                        <span className="shrink-0 w-14 text-center">Type</span>
                        {effectiveShowActual && <span className="w-12 text-right shrink-0">Actual</span>}
                        {effectiveShowTeam && <span className="w-12 text-right shrink-0">Team</span>}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Task list - Flat view (no grouping) */}
        {viewMode === "flat" && (
          <div className="space-y-0">
            {(() => {
              const q = search.trim().toLowerCase();
              const flatItems = allOccurrences
                .filter((occ) => !q || occ.text.toLowerCase().includes(q))
                .sort((a, b) => b.date.localeCompare(a.date) || a.text.localeCompare(b.text));

              const occGroupMap = new Map<string, string>();
              for (const g of taskGroups) {
                for (const occ of g.occurrences) {
                  occGroupMap.set(`${occ.date}::${occ.text}`, g.name);
                }
              }

              if (flatItems.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    {search ? "No tasks matching your search" : "No tasks logged yet"}
                  </div>
                );
              }

              return (
                <Card className="overflow-hidden">
                  {flatItems.map((occ, i) => {
                    const groupName = occGroupMap.get(`${occ.date}::${occ.text}`) || "";
                    return (
                      <div
                        key={`flat-${occ.date}::${occ.text}::${i}`}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/20 transition-colors",
                          i > 0 && "border-t border-border/20"
                        )}
                      >
                        <span className="font-mono text-muted-foreground whitespace-nowrap w-24 shrink-0">
                          {formatDate(occ.date)}
                        </span>
                        {groupName && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 max-w-[120px] truncate">
                            {groupName}
                          </Badge>
                        )}
                        <span className="flex-1 font-mono truncate text-foreground">
                          {occ.text}
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                          occ.source === "done"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}>
                          {occ.source === "done" ? t("tasks.done") : t("tasks.doing")}
                        </span>
                        {effectiveShowActual && (
                          <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                            {occ.actualHours > 0 ? `${occ.actualHours.toFixed(1)}h` : "–"}
                          </span>
                        )}
                        {effectiveShowTeam && (
                          <span className="font-mono text-muted-foreground w-12 text-right shrink-0">
                            {occ.teamHours > 0 ? `${occ.teamHours.toFixed(1)}h` : "–"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-muted-foreground border-t border-border/30 bg-muted/10">
                    <span className="w-24 shrink-0">Date</span>
                    <span className="flex-1">Group / Task</span>
                    <span className="shrink-0 w-14 text-center">Type</span>
                    {effectiveShowActual && <span className="w-12 text-right shrink-0">Actual</span>}
                    {effectiveShowTeam && <span className="w-12 text-right shrink-0">Team</span>}
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* Timeline view */}
        {viewMode === "timeline" && (
          <TimelineView
            taskGroups={filtered}
            allOccurrences={allOccurrences}
            showActual={effectiveShowActual}
            showTeam={effectiveShowTeam}
            formatDate={formatDate}
          />
        )}

        {/* Activity view */}
        {viewMode === "activity" && (
          <ActivityView
            taskGroups={filtered}
            allOccurrences={allOccurrences}
            showActual={effectiveShowActual}
            showTeam={effectiveShowTeam}
            formatDate={formatDate}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
