-- =============================================
-- RLS FIX: USERS TABLE
-- Description: Add missing INSERT and DELETE policies for the 'users' table.
-- Error: 42501 (RLS Policy Violation) on api.createUser
-- =============================================

-- 1. Policy for INSERT (Creation)
-- Allows public insert (for dev/simulated auth)
CREATE POLICY "Public Insert Users" ON users FOR INSERT WITH CHECK (true);

-- 2. Policy for DELETE (Removal)
-- Allows public delete (for dev/simulated auth)
CREATE POLICY "Public Delete Users" ON users FOR DELETE USING (true);

-- Note: SELECT and UPDATE policies already exist in policies.sql
