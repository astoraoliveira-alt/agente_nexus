import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from './api';
import { supabase } from '../lib/supabase';

interface TestResult {
    Service: string;
    Latency: string;
    Status: string;
}

describe('Local API REST Latency & Integrity Tests (Supabase DB)', () => {
    let tenantId: string;
    const latencyResults: TestResult[] = [];

    const recordLatency = (name: string, start: number, end: number, success: boolean = true) => {
        const latency = (end - start).toFixed(2);
        latencyResults.push({
            Service: name,
            Latency: `${latency}ms`,
            Status: success ? '✅ PASS' : '❌ FAIL'
        });
        return latency;
    };

    beforeAll(async () => {
        const start = performance.now();

        // 1. Authenticate to satisfy Row Level Security (RLS)
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email: import.meta.env.VITE_DEMO_EMAIL,
            password: import.meta.env.VITE_DEMO_PASSWORD
        });

        if (authErr) throw new Error(`Auth failed: ${authErr.message}`);

        // 2. Fetch the logged in user profile to get the tenantId
        const user = await api.getUserById(authData.user.id);
        const end = performance.now();

        recordLatency('Auth & getUserById', start, end);
        console.log(`⏱️ [LATENCY] Auth & getUserById: ${(end - start).toFixed(2)}ms`);

        expect(user).toBeDefined();
        if (user && user.tenantId) {
            tenantId = user.tenantId;
            console.log(`✅ Authenticated and fetched Tenant context successfully: ${tenantId}`);
        } else {
            console.warn('⚠️ User has no tenantId (Super Admin?). Fetching first available company...');
            const { data: companies, error: compErr } = await supabase.from('companies').select('id').limit(1);
            if (compErr || !companies || companies.length === 0) throw new Error('Could not fetch a fallback company for tenantId.');
            tenantId = companies[0].id;
            console.log(`✅ Fetched fallback Company ID: ${tenantId}`);
        }
    });

    afterAll(() => {
        console.log('\n📊 --- API PERFORMANCE AUDIT SUMMARY ---');
        console.table(latencyResults);
        console.log('-----------------------------------------\n');
    });

    it('should fetch companies overview efficiently (REST)', async () => {
        const start = performance.now();
        const companies = await api.getCompanies();
        const end = performance.now();

        recordLatency('getCompanies (REST)', start, end);
        console.log(`⏱️ [LATENCY] getCompanies: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(companies)).toBe(true);
        expect(end - start).toBeLessThan(1500);
    });

    it('should fetch companies overview directly (RPC)', async () => {
        const start = performance.now();
        const { data, error } = await supabase.rpc('get_companies_overview');
        const end = performance.now();

        recordLatency('get_companies_overview (RPC)', start, end, !error);
        console.log(`⏱️ [LATENCY] RPC get_companies_overview: ${(end - start).toFixed(2)}ms`);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
    });

    it('should fetch company users efficiently', async () => {
        const start = performance.now();
        const users = await api.getUsers(tenantId);
        const end = performance.now();

        recordLatency('getUsers', start, end);
        console.log(`⏱️ [LATENCY] getUsers: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(users)).toBe(true);
        expect(end - start).toBeLessThan(1500);
    });

    it('should fetch agents with improved latency (< 5000ms)', async () => {
        const start = performance.now();
        const agents = await api.getAgents(tenantId);
        const end = performance.now();

        recordLatency('getAgents', start, end);
        console.log(`⏱️ [LATENCY] getAgents: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(agents)).toBe(true);
        expect(end - start).toBeLessThan(1500);
    });

    it('should fetch agent usage stats directly (RPC)', async () => {
        const start = performance.now();
        const { data, error } = await supabase.rpc('get_agent_usage_stats', { p_tenant_id: tenantId });
        const end = performance.now();

        recordLatency('get_agent_usage_stats (RPC)', start, end, !error);
        console.log(`⏱️ [LATENCY] RPC get_agent_usage_stats: ${(end - start).toFixed(2)}ms`);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
    });

    it('should fetch detailed consumption directly (RPC)', async () => {
        const start = performance.now();
        const { data, error } = await supabase.rpc('get_detailed_consumption', { p_tenant_id: tenantId, p_days: 30 });
        const end = performance.now();

        recordLatency('get_detailed_consumption (RPC)', start, end, !error);
        console.log(`⏱️ [LATENCY] RPC get_detailed_consumption: ${(end - start).toFixed(2)}ms`);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
    });

    it('should fetch financial report (RPC)', async () => {
        const start = performance.now();
        const report = await api.getFinancialReport(new Date().getMonth() + 1, new Date().getFullYear());
        const end = performance.now();

        recordLatency('getFinancialReport (RPC)', start, end);
        console.log(`⏱️ [LATENCY] getFinancialReport: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(report)).toBe(true);
    });

    it('should fetch unaudited conversations (RPC)', async () => {
        const start = performance.now();
        const unaudited = await api.getUnauditedConversations(tenantId);
        const end = performance.now();

        recordLatency('getUnauditedConversations (RPC)', start, end);
        console.log(`⏱️ [LATENCY] getUnauditedConversations: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(unaudited)).toBe(true);
    });

    it('should fetch raw messages efficiently', async () => {
        const start = performance.now();
        const { data, error } = await supabase.from('messages').select('*').limit(50);
        const end = performance.now();

        recordLatency('messages?select= (REST)', start, end, !error);
        console.log(`⏱️ [LATENCY] messages?select=: ${(end - start).toFixed(2)}ms`);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
    });

    it('should fetch raw conversations efficiently', async () => {
        const start = performance.now();
        const { data, error } = await supabase.from('conversations').select('*').limit(50);
        const end = performance.now();

        recordLatency('conversations?select= (REST)', start, end, !error);
        console.log(`⏱️ [LATENCY] conversations?select=: ${(end - start).toFixed(2)}ms`);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
    });

    it('should fetch contacts quickly', async () => {
        const start = performance.now();
        const contacts = await api.getContacts(tenantId);
        const end = performance.now();

        recordLatency('getContacts', start, end);
        console.log(`⏱️ [LATENCY] getContacts: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(contacts)).toBe(true);
        expect(end - start).toBeLessThan(2000);
    });

    it('should load campaigns successfully', async () => {
        const start = performance.now();
        const campaigns = await api.getCampaigns(tenantId);
        const end = performance.now();

        recordLatency('getCampaigns', start, end);
        console.log(`⏱️ [LATENCY] getCampaigns: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(campaigns)).toBe(true);
    });

    it('should load conversations overview wrapper', async () => {
        const start = performance.now();
        const conversations = await api.getConversationsOverview(tenantId);
        const end = performance.now();

        recordLatency('getConversationsOverview', start, end);
        console.log(`⏱️ [LATENCY] getConversationsOverview: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(conversations)).toBe(true);
    });

    it('should fetch consumption metrics wrapper', async () => {
        const start = performance.now();
        const metrics = await api.getConsumptionMetrics(tenantId, 30);
        const end = performance.now();

        recordLatency('getConsumptionMetrics', start, end);
        console.log(`⏱️ [LATENCY] getConsumptionMetrics (30d): ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(metrics)).toBe(true);
    });

    it('should load quality evaluations', async () => {
        const start = performance.now();
        const evalData = await api.getEvaluations(tenantId);
        const end = performance.now();

        recordLatency('getEvaluations', start, end);
        console.log(`⏱️ [LATENCY] getEvaluations: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(evalData)).toBe(true);
    });

    it('should query active incidents', async () => {
        const start = performance.now();
        const incidents = await api.getIncidents(tenantId);
        const end = performance.now();

        recordLatency('getIncidents', start, end);
        console.log(`⏱️ [LATENCY] getIncidents: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(incidents)).toBe(true);
    });
});
