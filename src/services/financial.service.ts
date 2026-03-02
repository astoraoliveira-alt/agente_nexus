import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const financialService = {
async getFinancialReport(month: number, year: number): Promise<import('@/lib/types').FinancialReportRecord[]> {
        const { data, error } = await supabase
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
    }
};
