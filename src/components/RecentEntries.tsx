import { Entry } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, History } from "lucide-react";
import { usePresentationMode } from "@/lib/presentation-mode";
import { stripAllHours } from "@/lib/text-sanitizer";

interface RecentEntriesProps {
  entries: Entry[];
  onSelectDate: (date: string) => void;
}

export function RecentEntries({ entries, onSelectDate }: RecentEntriesProps) {
  const { presentationMode } = usePresentationMode();
  const recent = entries.slice(0, 5);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <History className="w-4 h-4" />
          Recent Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No entries yet</p>
        ) : (
          recent.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelectDate(entry.date)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {new Date(entry.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {entry.version && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{entry.version}</Badge>
                  )}
                  {!presentationMode && (
                    <>
                      <Clock className="w-3 h-3" />
                      {entry.hours}h
                    </>
                  )}
                </span>
              </div>
              {entry.done && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{presentationMode ? stripAllHours(entry.done) : entry.done}</p>
              )}
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
