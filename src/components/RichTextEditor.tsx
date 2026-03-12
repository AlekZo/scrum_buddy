import * as React from "react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
}

export function RichTextEditor({ value, onChange, placeholder, className, suggestions = [] }: RichTextEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  // Update suggestions based on current line
  React.useEffect(() => {
    if (!focused || suggestions.length === 0) {
      setShowSuggestions(false);
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart } = textarea;
    const before = value.slice(0, selectionStart);
    const lines = before.split("\n");
    const currentLine = lines[lines.length - 1].trim().replace(/^[-•*]\s*/, "");

    if (currentLine.length < 2) {
      setShowSuggestions(false);
      return;
    }

    const lower = currentLine.toLowerCase();
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower)
      .slice(0, 5);

    if (matches.length > 0) {
      setFilteredSuggestions(matches);
      setSelectedIndex(0);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [value, focused, suggestions]);

  const applySuggestion = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart } = textarea;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionStart);
    const lines = before.split("\n");
    const currentLine = lines[lines.length - 1];
    const bullet = currentLine.match(/^([-•*]\s*)/)?.[1] || "";

    lines[lines.length - 1] = bullet + suggestion;
    const newValue = lines.join("\n") + after;
    onChange(newValue);
    setShowSuggestions(false);

    setTimeout(() => {
      const pos = lines.join("\n").length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle suggestion navigation
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && filteredSuggestions.length > 0)) {
        // Only intercept Enter for suggestions if Tab would also apply
        if (e.key === "Tab") {
          e.preventDefault();
          applySuggestion(filteredSuggestions[selectedIndex]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    const textarea = e.currentTarget;

    if (e.key === "Enter") {
      e.preventDefault();
      const { selectionStart } = textarea;
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionStart);

      const lines = before.split("\n");
      const currentLine = lines[lines.length - 1];
      if (currentLine.trim() === "•") {
        lines[lines.length - 1] = "";
        onChange(lines.join("\n") + after);
        setTimeout(() => {
          const pos = lines.join("\n").length;
          textarea.setSelectionRange(pos, pos);
        }, 0);
        return;
      }

      const newText = before + "\n• " + after;
      onChange(newText);
      setTimeout(() => {
        const pos = selectionStart + 3;
        textarea.setSelectionRange(pos, pos);
      }, 0);
      return;
    }

    if (e.key === "Backspace") {
      const { selectionStart, selectionEnd } = textarea;
      if (selectionStart !== selectionEnd) return;

      const before = value.slice(0, selectionStart);
      const lines = before.split("\n");
      const currentLine = lines[lines.length - 1];

      if (currentLine === "• ") {
        e.preventDefault();
        lines[lines.length - 1] = "";
        const newBefore = lines.join("\n");
        onChange(newBefore + value.slice(selectionStart));
        setTimeout(() => {
          const pos = newBefore.length;
          textarea.setSelectionRange(pos, pos);
        }, 0);
        return;
      }
    }

    if (e.key === "b" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      wrapSelection("**");
      return;
    }
    if (e.key === "i" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      wrapSelection("*");
      return;
    }
    if (e.key === "e" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      wrapSelection("`");
      return;
    }
  };

  const wrapSelection = (marker: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const selected = value.slice(selectionStart, selectionEnd);
    const newText = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
    onChange(newText);
    setTimeout(() => {
      if (selected) {
        textarea.setSelectionRange(selectionStart, selectionEnd + marker.length * 2);
      } else {
        const pos = selectionStart + marker.length;
        textarea.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleFocus = () => {
    setFocused(true);
    if (!value) onChange("• ");
  };

  const handleBlur = () => {
    // Delay to allow suggestion clicks
    setTimeout(() => {
      setFocused(false);
      setShowSuggestions(false);
      if (value.trim() === "•") onChange("");
    }, 150);
  };

  const hasContent = value.trim() && value.trim() !== "•";
  const hasFormatting = value.includes("**") || value.includes("*") || value.includes("`");

  return (
    <div className={cn("space-y-0 relative", className)}>
      <textarea
        ref={textareaRef}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none",
        )}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
      />

      {/* Autocomplete dropdown */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden"
        >
          {filteredSuggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent transition-colors",
                i === selectedIndex && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              {s}
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] text-muted-foreground border-t border-border/50">
            Tab to accept · Esc to dismiss
          </div>
        </div>
      )}

      {!focused && hasContent && hasFormatting && (
        <div className="px-3 py-1.5 text-xs border border-t-0 border-border/50 rounded-b-md bg-muted/20">
          <MarkdownPreview text={value} />
        </div>
      )}
    </div>
  );
}

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trim().replace(/^[•\-*]\s*/, "");
        const isBullet = /^[•\-*]\s/.test(line.trim());
        return (
          <div key={i} className="flex items-start gap-1.5">
            {isBullet && <span className="text-muted-foreground mt-px">•</span>}
            <span
              className="flex-1"
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(isBullet ? trimmed : line.trim()) }}
            />
          </div>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-[0.85em] font-mono">$1</code>');
}
