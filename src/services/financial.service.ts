import { supabase, supabaseReader } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const financialService = {
async getFinancialReport(month: number, year: number): Promise<import('@/lib/types').FinancialReportRecord[]> {
        const { data, error } = await supabaseReader
            .rpc('get_financial_report', { p_month: month, p_year: year });

        if (error) {
            console.error('Error fetching financial report:', error);
            return [];
        }

        if (!data) return [];

        return data.map((r: any) => ({
            tenantId: r.tenant_id,
            companyName: r.company_name,
            planName: r.plan_name,
            revenueFixed: Number(r.revenue_fixed || 0),
            revenueVariable: Number(r.revenue_variable || 0),
            costFixed: Number(r.cost_fixed || 0),
            costVariableLlm: Number(r.cost_variable_llm || 0),
            costVariableVoice: Number(r.cost_variable_voice || 0),
            costVariableOther: Number(r.cost_variable_other || 0),
            netMargin: Number(r.net_margin || 0)
        }));
    },
    async processBilling(month: number, year: number): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const { error } = await supabase.functions.invoke('process-billing', {
            body: { month, year },
            headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (error) {
            console.error('Error triggering billing:', error);
            throw error;
        }
    }
};

