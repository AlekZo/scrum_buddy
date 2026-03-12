# Daily Scrum Logger

A local-first daily standup tracker with offline support, planning boards, timesheets, and optional Supabase sync.

## Features

- **Daily Log** — Track what you did, what you're doing next, and blockers with inline time parsing (`task - 2h`, `30m`, `3ч`)
- **Planning Board** — Weekly kanban-style view to plan tasks per day
- **Timesheet** — Auto-aggregated hours from logged tasks with utilization tracking
- **Multi-project** — Create, rename, and switch between projects
- **Offline-first** — All data stored in localStorage; works 100% without internet
- **Supabase Sync** — Optional remote sync via Settings; auto-syncs on reconnect
- **Import/Export** — Markdown, JSON, and Excel export; JSON and CSV import
- **Auto-complete** — Task name suggestions from history as you type
- **Tags** — Add `[frontend]`, `[meeting]` etc. to tasks for grouping in timesheets
- **Rich Text** — Bullet points, bold (`Ctrl+B`), italic (`Ctrl+I`), code (`Ctrl+E`)

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Supabase JS (optional sync)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Opens at `http://localhost:8080`

## Docker

```bash
# Build and run
docker build -t scrum-logger .
docker run -p 3000:80 scrum-logger
```

Opens at `http://localhost:3000`

## Supabase Sync (Optional)

1. Create a Supabase project
2. Run `schema.sql` in the SQL Editor to create tables
3. Click the ⚙️ Settings icon in the app header
4. Enter your Supabase URL and anon key
5. The app will auto-sync when online

## Export Formats

| Format | What's included |
|--------|----------------|
| Markdown (.md) | Formatted log entries with bullet points |
| JSON (.json) | Full structured data, re-importable |
| Excel (.xlsx) | One sheet per project with columns for date, tasks, hours |

## Import Formats

| Format | Requirements |
|--------|-------------|
| JSON (.json) | Must have `projects` and `entries` keys |
| CSV (.csv) | Needs at least a `date` column; optional: `project`, `done`, `doing`, `blockers`, `hours` |
