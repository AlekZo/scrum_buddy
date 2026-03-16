/**
 * Lightweight Express server for Docker deployment.
 * Serves the static SPA and provides a file-based storage API
 * so data persists on a Docker volume instead of only in localStorage.
 *
 * Volume mount: /data  (contains scrum-data.json and settings/)
 */
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 80;
const DATA_DIR = process.env.DATA_DIR || "/data";
const DATA_FILE = path.join(DATA_DIR, "scrum-data.json");
const SETTINGS_DIR = path.join(DATA_DIR, "settings");

// Ensure data directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
ensureDir(DATA_DIR);
ensureDir(SETTINGS_DIR);

// Parse JSON bodies (up to 10MB for large datasets)
app.use(express.json({ limit: "10mb" }));

// ── Storage API ────────────────────────────────────────

// GET /api/data — read main scrum data
app.get("/api/data", (_req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json(null);
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("[api] Failed to read data:", err.message);
    res.status(500).json({ error: "Failed to read data" });
  }
});

// PUT /api/data — write main scrum data
app.put("/api/data", (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (err) {
    console.error("[api] Failed to write data:", err.message);
    res.status(500).json({ error: "Failed to write data" });
  }
});

// GET /api/settings/:key — read a settings key
app.get("/api/settings/:key", (req, res) => {
  try {
    const file = path.join(SETTINGS_DIR, `${req.params.key}.json`);
    if (!fs.existsSync(file)) {
      return res.json(null);
    }
    const raw = fs.readFileSync(file, "utf-8");
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("[api] Failed to read setting:", err.message);
    res.status(500).json({ error: "Failed to read setting" });
  }
});

// PUT /api/settings/:key — write a settings key
app.put("/api/settings/:key", (req, res) => {
  try {
    const file = path.join(SETTINGS_DIR, `${req.params.key}.json`);
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (err) {
    console.error("[api] Failed to write setting:", err.message);
    res.status(500).json({ error: "Failed to write setting" });
  }
});

// GET /api/health — health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", dataDir: DATA_DIR, hasData: fs.existsSync(DATA_FILE) });
});

// ── Serve static SPA ───────────────────────────────────

app.use(express.static(path.join(__dirname, "dist"), {
  maxAge: "1y",
  immutable: true,
  index: "index.html",
}));

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] Data directory: ${DATA_DIR}`);
  console.log(`[server] Data file exists: ${fs.existsSync(DATA_FILE)}`);
});
