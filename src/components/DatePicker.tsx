import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToday } from "@/lib/types";

interface DatePickerProps {
  date: string;
  onChange: (date: string) => void;
}

export function DatePicker({ date, onChange }: DatePickerProps) {
  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    onChange(d.toISOString().split("T")[0]);
  };

  const isToday = date === getToday();
  const displayDate = new Date(date).toLocaleDateString("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} className="h-8 w-8">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <div className="flex items-center gap-1.5 text-sm">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{displayDate}</span>
        {isToday && (
          <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">TODAY</span>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={() => shift(1)} className="h-8 w-8">
        <ChevronRight className="w-4 h-4" />
      </Button>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(getToday())} className="text-xs text-muted-foreground h-7">
          Go to today
        </Button>
      )}
    </div>
  );
}
