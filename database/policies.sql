-- =============================================
-- POLICIES (Row Level Security)
-- Run this in Supabase SQL Editor to enable access
-- =============================================

-- 1. Enable RLS on core tables (Security Best Practice)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2. Create "Public Dev" Policies 
-- ⚠️ WARNING: These policies allow PUBLIC access (Anon Key). 
-- This is intended for the "Simulated Auth" phase of development.
-- In production, replacing these with authenticated policies (auth.uid() = user_id) is mandatory.

-- COMPANIES
CREATE POLICY "Public Read Companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Public Update Companies" ON companies FOR UPDATE USING (true);

-- USERS
CREATE POLICY "Public Read Users" ON users FOR SELECT USING (true);
CREATE POLICY "Public Update Users" ON users FOR UPDATE USING (true);

-- AGENTS
CREATE POLICY "Public Read Agents" ON agents FOR SELECT USING (true);
CREATE POLICY "Public Insert Agents" ON agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Agents" ON agents FOR UPDATE USING (true);
CREATE POLICY "Public Delete Agents" ON agents FOR DELETE USING (true);

-- FLOWS
CREATE POLICY "Public Read Flows" ON flows FOR SELECT USING (true);
CREATE POLICY "Public Insert Flows" ON flows FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Flows" ON flows FOR UPDATE USING (true);

-- CONVERSATIONS
CREATE POLICY "Public Read Conversations" ON conversations FOR SELECT USING (true);
CREATE POLICY "Public Insert Conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Conversations" ON conversations FOR UPDATE USING (true);

-- MESSAGES
CREATE POLICY "Public Read Messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Public Insert Messages" ON messages FOR INSERT WITH CHECK (true);
