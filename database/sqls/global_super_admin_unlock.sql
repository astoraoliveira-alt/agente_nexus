-- =============================================
-- SECURITY AUDIT FIX: Global Super Admin Unlock
-- Purpose: Allow Super Admins to view and manage all tenants
-- Fix: Bypasses tenant isolation for roles with internal 'super_admin' flag
-- =============================================

-- 🔄 1. AGENTS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Agents" ON public.agents;
CREATE POLICY "Super Admin All Access Agents" ON public.agents 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 2. CONVERSATIONS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Conversations" ON public.conversations;
CREATE POLICY "Super Admin All Access Conversations" ON public.conversations 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 3. MESSAGES
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Messages" ON public.messages;
CREATE POLICY "Super Admin All Access Messages" ON public.messages 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 4. CONTACTS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Contacts" ON public.contacts;
CREATE POLICY "Super Admin All Access Contacts" ON public.contacts 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 5. CAMPAIGNS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Campaigns" ON public.campaigns;
CREATE POLICY "Super Admin All Access Campaigns" ON public.campaigns 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 6. INCIDENTS
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Incidents" ON public.incidents;
CREATE POLICY "Super Admin All Access Incidents" ON public.incidents 
FOR ALL USING (public.check_is_super_admin());

-- 🔄 7. AGENT KNOWLEDGE
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin All Access Knowledge" ON public.agent_knowledge;
CREATE POLICY "Super Admin All Access Knowledge" ON public.agent_knowledge 
FOR ALL USING (public.check_is_super_admin());

-- 🏁 Refreshing Cache
NOTIFY pgrst, 'reload schema';
