import { useRef } from "react";
import { Palette, ImagePlus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ProjectVisualSettings, PROJECT_COLORS, compressImage } from "@/lib/project-settings";

interface ProjectSettingsPopoverProps {
  settings: ProjectVisualSettings;
  onUpdate: (update: Partial<ProjectVisualSettings>) => void;
  children: React.ReactNode;
}

export function ProjectSettingsPopover({ settings, onUpdate, children }: ProjectSettingsPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 80);
      onUpdate({ image: dataUrl });
    } catch {
      console.error("Failed to process image");
    }
    e.target.value = "";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-56 p-3 space-y-3">
        {/* Color picker */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Palette className="w-3 h-3" /> Color
          </span>
          <div className="grid grid-cols-6 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onUpdate({ color })}
                className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                  settings.color === color ? "border-foreground scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Image upload */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <ImagePlus className="w-3 h-3" /> Icon
          </span>
          <div className="flex items-center gap-2">
            {settings.image ? (
              <div className="relative">
                <img
                  src={settings.image}
                  alt="Project icon"
                  className="w-10 h-10 rounded-lg object-cover border border-border"
                />
                <button
                  onClick={() => onUpdate({ image: undefined })}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="w-3.5 h-3.5 mr-1" />
              {settings.image ? "Change" : "Upload"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
