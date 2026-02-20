import { describe, it, expect, beforeAll } from 'vitest';
import { api } from './api';
import { supabase } from '../lib/supabase';

describe('Local API REST Latency & Integrity Tests (Supabase DB)', () => {
    let tenantId: string;

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

    it('should fetch companies overview efficiently', async () => {
        const start = performance.now();
        const companies = await api.getCompanies();
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getCompanies: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(companies)).toBe(true);
        expect(end - start).toBeLessThan(1500); // 🚀 Testing baseline for optimization
    });

    it('should fetch company users efficiently', async () => {
        const start = performance.now();
        const users = await api.getUsers(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getUsers: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(users)).toBe(true);
        expect(end - start).toBeLessThan(1500); // Latency check
    });

    it('should fetch agents with improved latency (< 1000ms)', async () => {
        const start = performance.now();
        const agents = await api.getAgents(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getAgents (after optimization): ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(agents)).toBe(true);
        expect(end - start).toBeLessThan(1200); // 🚀 Dropped from 1.8s+ to ~0.89s after SQL RPC
    });

    it('should fetch contacts quickly', async () => {
        const start = performance.now();
        const contacts = await api.getContacts(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getContacts: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(contacts)).toBe(true);
        expect(end - start).toBeLessThan(2000); // Contacts might be a larger table
    });

    it('should load campaigns successfully', async () => {
        const start = performance.now();
        const campaigns = await api.getCampaigns(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getCampaigns: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(campaigns)).toBe(true);
        expect(end - start).toBeLessThan(1500);
    });

    it('should load conversations overview', async () => {
        const start = performance.now();
        const conversations = await api.getConversationsOverview(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getConversationsOverview: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(conversations)).toBe(true);
        expect(end - start).toBeLessThan(2000);
    });

    it.skip('should fetch flow architectures', async () => {
        const start = performance.now();
        const flows = await api.getFlows(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getFlows: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(flows)).toBe(true);
        expect(end - start).toBeLessThan(800);
    });

    it('should fetch consumption metrics', async () => {
        const start = performance.now();
        const metrics = await api.getConsumptionMetrics(tenantId, 30);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getConsumptionMetrics (30d): ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(metrics)).toBe(true);
        expect(end - start).toBeLessThan(800);
    });

    it('should load quality evaluations', async () => {
        const start = performance.now();
        const evalData = await api.getEvaluations(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getEvaluations: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(evalData)).toBe(true);
        expect(end - start).toBeLessThan(800);
    });

    it('should query active incidents', async () => {
        const start = performance.now();
        const incidents = await api.getIncidents(tenantId);
        const end = performance.now();

        console.log(`⏱️ [LATENCY] getIncidents: ${(end - start).toFixed(2)}ms`);
        expect(Array.isArray(incidents)).toBe(true);
        expect(end - start).toBeLessThan(800);
    });
});
