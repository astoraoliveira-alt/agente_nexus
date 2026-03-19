import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const capabilitiesService = {
async getPolicies(tenant_id: string): Promise<import('@/lib/types').AIPolicy[]> {
        const { data, error } = await supabase
            .from('policies')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching policies:', error);
            return [];
        }

        return data.map((p: any) => ({
            id: p.id,
            tenantId: p.tenant_id,
            name: p.name,
            version: p.version,
            createdAt: new Date(p.created_at),
            rules: p.rules,
            isActive: p.is_active
        }));
    },

async createPolicy(policy: Partial<import('@/lib/types').AIPolicy>): Promise<void> {
        console.log('API createPolicy payload:', policy);
        const payload: any = {
            tenant_id: policy.tenantId,
            name: policy.name,
            version: policy.version,
            rules: policy.rules,
            is_active: policy.isActive
        };

        // If it's an update, include the ID
        if (policy.id) {
            console.log('Treating as UPDATE (ID found):', policy.id);
            payload.id = policy.id;
        } else {
            console.log('Treating as INSERT (No ID found)');
        }

        const { error } = await supabase
            .from('policies')
            .upsert(payload);

        if (error) throw error;
    },

    async generatePolicySuggestions(policyName: string): Promise<any> {
        const { data, error } = await supabase.functions.invoke('generate-policy', {
            body: { policyName }
        });

        if (error) {
            console.error('Error in generatePolicySuggestions:', error);
            throw new Error(`Erro ao gerar sugestões: ${error.message || 'Falha na Edge Function'}`);
        }

        return data;
    },

async deletePolicy(id: string): Promise<void> {
        const { error } = await supabase
            .from('policies')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
