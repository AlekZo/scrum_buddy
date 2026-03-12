import * as React from "react";
import { cn } from "@/lib/utils";

interface BulletTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Textarea that auto-inserts bullet points on new lines.
 * User can delete the bullet by pressing backspace on an empty bullet line.
 */
export const BulletTextarea = React.forwardRef<HTMLTextAreaElement, BulletTextareaProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;

      if (e.key === "Enter") {
        e.preventDefault();
        const { selectionStart } = textarea;
        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionStart);

        // Check if current line is just a bullet (empty bullet) — if so, remove it
        const lines = before.split("\n");
        const currentLine = lines[lines.length - 1];
        if (currentLine.trim() === "•") {
          // Remove the bullet line and just add a newline
          lines[lines.length - 1] = "";
          onChange(lines.join("\n") + after);
          // Set cursor after the newline
          setTimeout(() => {
            const pos = lines.join("\n").length;
            textarea.setSelectionRange(pos, pos);
          }, 0);
          return;
        }

        const newText = before + "\n• " + after;
        onChange(newText);
        setTimeout(() => {
          const pos = selectionStart + 3; // "\n• " = 3 chars
          textarea.setSelectionRange(pos, pos);
        }, 0);
        return;
      }

      if (e.key === "Backspace") {
        const { selectionStart, selectionEnd } = textarea;
        if (selectionStart !== selectionEnd) return; // let default handle selection delete

        const before = value.slice(0, selectionStart);
        const lines = before.split("\n");
        const currentLine = lines[lines.length - 1];

        // If cursor is right after "• ", remove the bullet
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
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    // Auto-add bullet to first line if empty
    const handleFocus = () => {
      if (!value) {
        onChange("• ");
      }
    };

    const handleBlur = () => {
      // Clean up if only a bullet remains
      if (value.trim() === "•") {
        onChange("");
      }
    };

    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);
BulletTextarea.displayName = "BulletTextarea";
