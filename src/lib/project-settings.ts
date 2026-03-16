/**
 * Per-project visual settings (color, image) stored separately from ScrumData
 * to avoid breaking sync. Stored in localStorage.
 */

const STORAGE_KEY = "project-visual-settings";

export interface ProjectVisualSettings {
  color?: string;   // HSL string like "hsl(262, 52%, 56%)"
  image?: string;    // base64 data URL
}

type SettingsMap = Record<string, ProjectVisualSettings>;

export function loadProjectSettings(): SettingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProjectSettings(settings: SettingsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("[project-settings] Failed to save:", err);
  }
}

export function getProjectSetting(project: string): ProjectVisualSettings {
  return loadProjectSettings()[project] || {};
}

export function setProjectSetting(project: string, update: Partial<ProjectVisualSettings>): void {
  const all = loadProjectSettings();
  all[project] = { ...all[project], ...update };
  saveProjectSettings(all);
}

export function removeProjectSetting(project: string): void {
  const all = loadProjectSettings();
  delete all[project];
  saveProjectSettings(all);
}

export function renameProjectSetting(oldName: string, newName: string): void {
  const all = loadProjectSettings();
  if (all[oldName]) {
    all[newName] = all[oldName];
    delete all[oldName];
    saveProjectSettings(all);
  }
}

/** Compress an image file to a small base64 data URL */
export function compressImage(file: File, maxSize = 64): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d")!;
        // Cover crop
        const scale = Math.max(maxSize / img.width, maxSize / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export const PROJECT_COLORS = [
  "hsl(172, 66%, 45%)",  // teal
  "hsl(262, 52%, 56%)",  // purple
  "hsl(38, 92%, 50%)",   // amber
  "hsl(340, 65%, 55%)",  // rose
  "hsl(210, 68%, 52%)",  // blue
  "hsl(152, 60%, 42%)",  // green
  "hsl(25, 75%, 55%)",   // orange
  "hsl(290, 45%, 55%)",  // violet
  "hsl(0, 70%, 55%)",    // red
  "hsl(190, 70%, 45%)",  // cyan
  "hsl(60, 70%, 45%)",   // olive
  "hsl(320, 60%, 50%)",  // magenta
];
