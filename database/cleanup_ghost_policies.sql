-- CLEANUP GHOST POLICIES SCRIPT
-- Run this if you see duplicate or old policies in verify_schema.sql output

-- 1. Plans
DROP POLICY IF EXISTS "Allow public read access" ON plans;
DROP POLICY IF EXISTS "Allow public write access" ON plans;
DROP POLICY IF EXISTS "Allow public update access" ON plans;
DROP POLICY IF EXISTS "Allow public delete access" ON plans;

-- 2. Evaluations
DROP POLICY IF EXISTS "Allow tenant read access" ON evaluations;

-- 3. Agent Knowledge
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON agent_knowledge;
