-- Schema for Daily Scrum Logger — Supabase
-- Execute this SQL in your Supabase SQL Editor.

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_name, date)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_entries_project_date ON entries (project_name, date);

-- Enable RLS (optional — disable if using service key)
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
