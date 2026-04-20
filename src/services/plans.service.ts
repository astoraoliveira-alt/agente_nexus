import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const plansService = {
async getPlans(): Promise<PlanCatalog[]> {
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .order('base_price', { ascending: true });

        if (error) {
            console.error('Error fetching plans:', error);
            return [];
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            description: p.description,
            basePrice: Number(p.base_price),
            monthlyFeeCoversUsage: p.monthly_fee_covers_usage, // Map DB to Frontend
            llmTokenPrice: Number(p.llm_token_price),
            messagePrice: Number(p.message_price),
            sttMinutePrice: Number(p.stt_minute_price),
            ttsMinutePrice: Number(p.tts_minute_price),
            whatsappOfficialBillingMode: p.whatsapp_official_billing_mode || 'per_message',
            whatsappWindowPrice: Number(p.whatsapp_window_price || 0),
            whatsappOfficialProviders: Array.isArray(p.whatsapp_official_providers) ? p.whatsapp_official_providers : ['meta', 'zenvia'],
            defaultLimits: p.default_limits
        }));
    },

async createPlan(plan: PlanCatalog): Promise<PlanCatalog | null> {
        const dbPlan = {
            id: plan.id,
            name: plan.name,
            type: plan.type,
            description: plan.description,
            base_price: plan.basePrice,
            monthly_fee_covers_usage: plan.monthlyFeeCoversUsage, // Map Frontend to DB
            llm_token_price: plan.llmTokenPrice,
            message_price: plan.messagePrice,
            stt_minute_price: plan.sttMinutePrice,
            tts_minute_price: plan.ttsMinutePrice,
            whatsapp_official_billing_mode: plan.whatsappOfficialBillingMode || 'per_message',
            whatsapp_window_price: plan.whatsappWindowPrice || 0,
            whatsapp_official_providers: plan.whatsappOfficialProviders || ['meta', 'zenvia'],
            default_limits: plan.defaultLimits,
            updated_at: new Date()
        };

        const { data, error } = await supabase
            .from('plans')
            .insert(dbPlan)
            .select()
            .single();

        if (error) {
            console.error('Error creating plan:', error);
            return null;
        }

        return plan;
    },

async updatePlan(plan: PlanCatalog): Promise<PlanCatalog | null> {
        const dbPlan = {
            name: plan.name,
            type: plan.type,
            description: plan.description,
            base_price: plan.basePrice,
            monthly_fee_covers_usage: plan.monthlyFeeCoversUsage, // Map Frontend to DB
            llm_token_price: plan.llmTokenPrice,
            message_price: plan.messagePrice,
            stt_minute_price: plan.sttMinutePrice,
            tts_minute_price: plan.ttsMinutePrice,
            whatsapp_official_billing_mode: plan.whatsappOfficialBillingMode || 'per_message',
            whatsapp_window_price: plan.whatsappWindowPrice || 0,
            whatsapp_official_providers: plan.whatsappOfficialProviders || ['meta', 'zenvia'],
            default_limits: plan.defaultLimits,
            updated_at: new Date()
        };

        const { error } = await supabase
            .from('plans')
            .update(dbPlan)
            .eq('id', plan.id);

        if (error) {
            console.error('Error updating plan:', error);
            return null;
        }

        return plan;
    },

async getDavosCosts(tenantId: string): Promise<import('@/lib/types').CompanyDavosCost[]> {
        const { data, error } = await supabase
            .from('company_davos_costs')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error) {
            console.error('Error fetching davos costs:', error);
            return [];
        }

        return data.map((d: any) => ({
            id: d.id,
            tenantId: d.tenant_id,
            itemKey: d.item_key,
            itemLabel: d.item_label,
            costValue: Number(d.cost_value),
            isRecurring: d.is_recurring,
            createdAt: new Date(d.created_at),
            updatedAt: new Date(d.updated_at)
        }));
    },

async updateDavosCost(cost: Partial<import('@/lib/types').CompanyDavosCost> & { tenantId: string; itemKey: string }): Promise<void> {
        const payload = {
            tenant_id: cost.tenantId,
            item_key: cost.itemKey,
            item_label: cost.itemLabel,
            cost_value: cost.costValue,
            is_recurring: cost.isRecurring,
            updated_at: new Date()
        };

        const { error } = await supabase
            .from('company_davos_costs')
            .upsert(payload, { onConflict: 'tenant_id, item_key' });

        if (error) {
            console.error('Error updating davos cost:', error);
            throw error;
        }
    }
};
