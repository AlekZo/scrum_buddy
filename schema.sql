-- Schema for Daily Scrum Logger — Supabase
-- Execute this SQL in your Supabase SQL Editor.

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false
);

-- Entries table
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY,
  project_name TEXT NOT NULL,
  date DATE NOT NULL,
  done TEXT DEFAULT '',
  doing TEXT DEFAULT '',
  blockers TEXT DEFAULT '',
  hours NUMERIC DEFAULT 0,
  version TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE (project_name, date)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_entries_project_date ON entries (project_name, date);
CREATE INDEX IF NOT EXISTS idx_entries_not_deleted ON entries (is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_projects_not_deleted ON projects (is_deleted) WHERE is_deleted = false;

-- Migration for existing databases (safe to re-run):
-- ALTER TABLE entries ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
-- ALTER TABLE entries ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '';
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Enable RLS (optional — disable if using service key)
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
