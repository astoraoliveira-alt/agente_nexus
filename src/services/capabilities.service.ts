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
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) throw new Error('OpenAI API Key not configured');

        const prompt = `Você é um especialista em governança de IA e ISO 42001. 
        Com base no nome da política "${policyName}", sugira regras de comportamento.
        Retorne APENAS um JSON válido estruturado assim: 
        { 
          "canDo": ["regra 1", "regra 2", "regra 3"], 
          "cannotDo": ["regra 1", "regra 2", "regra 3"], 
          "transferConditions": ["regra 1", "regra 2"] 
        }`;

        const endpoint = import.meta.env.DEV ? '/openai-api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: 'Erro desconhecido' } }));
                const errMsg = errData.error?.message || response.statusText;
                console.error('OpenAI 401 Debug:', errData);
                throw new Error(`OpenAI Error (${response.status}): ${errMsg}`);
            }

            const data = await response.json();
            const rawContent = data.choices[0].message.content;

            try {
                const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
                const content = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
                return content;
            } catch (e) {
                console.error('Failed to parse AI response:', rawContent);
                throw new Error('A IA não retornou um formato válido. Tente novamente.');
            }
        } catch (error: any) {
            console.error('Error in generatePolicySuggestions:', error);
            throw error;
        }
    },

async deletePolicy(id: string): Promise<void> {
        const { error } = await supabase
            .from('policies')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
