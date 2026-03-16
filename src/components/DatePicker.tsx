import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getToday } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  date: string;
  onChange: (date: string) => void;
}

export function DatePicker({ date, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    onChange(d.toISOString().split("T")[0]);
  };

  const isToday = date === getToday();
  const selectedDate = new Date(date + "T00:00:00");

  const displayDate = selectedDate.toLocaleDateString("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleCalendarSelect = (day: Date | undefined) => {
    if (day) {
      onChange(day.toISOString().split("T")[0]);
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} className="h-8 w-8">
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-sm font-medium hover:bg-muted"
          >
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <span>{displayDate}</span>
            {isToday && (
              <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                TODAY
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
          {!isToday && (
            <div className="px-3 pb-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  onChange(getToday());
                  setOpen(false);
                }}
              >
                Go to today
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" onClick={() => shift(1)} className="h-8 w-8">
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
