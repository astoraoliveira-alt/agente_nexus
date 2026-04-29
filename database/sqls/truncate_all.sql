-- Database Truncate Script
-- WARNING: This will delete ALL data from the specified tables.
-- Run this before importing data_dump.sql to avoid conflicts.

TRUNCATE TABLE
    public.integration_logs,
    public.audit_logs,
    public.consumption_metrics,
    public.incidents,
    public.evaluations,
    public.messages,
    public.conversations,
    public.agent_flows,
    public.flow_stages,
    public.flows,
    public.agent_audit_logs,
    public.agent_knowledge,
    public.agents,
    public.contacts,
    public.policies,
    public.billing_alerts,
    public.company_davos_costs,
    public.users,
    public.companies,
    public.plans,
    public.plan_audit_logs,
    public.chat_histories_memory
RESTART IDENTITY CASCADE;
