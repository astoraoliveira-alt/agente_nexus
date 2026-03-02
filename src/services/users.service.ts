import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const usersService = {
async getUserById(userId: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) return null;

        return {
            ...data,
            name: data.full_name,
            tenantId: data.tenant_id
        } as unknown as User;
    },

async getUsers(tenantId: string): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error) throw error;

        return data.map((u: any) => ({
            ...u,
            name: u.full_name,
            tenantId: u.tenant_id,
            isActive: u.is_active
        })) as User[];
    },

async getUserByEmail(email: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error) return null;

        return {
            ...data,
            name: data.full_name,
            tenantId: data.tenant_id
        } as unknown as User;
    },

async createUser(user: Partial<User>): Promise<User> {
        const { data, error } = await supabase
            .from('users')
            .insert({
                full_name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenantId,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating user:', error);
            throw error;
        }

        return {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
            tenantId: data.tenant_id,
            isActive: data.is_active
        } as User;
    },

async updateUser(userId: string, updates: Partial<User>): Promise<User> {
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.full_name = updates.name;
        if (updates.email) dbUpdates.email = updates.email;
        if (updates.role) dbUpdates.role = updates.role;

        const { data, error } = await supabase
            .from('users')
            .update(dbUpdates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error updating user:', error);
            throw error;
        }

        return {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
            tenantId: data.tenant_id,
            isActive: data.is_active
        } as User;
    },

async deleteUser(userId: string): Promise<void> {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    },

async getTenant(tenantId: string): Promise<Company | null> {
        // 1. Fetch Company
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('*')
            .eq('id', tenantId)
            .maybeSingle();

        if (companyError || !company) {
            if (companyError) console.error('Error fetching tenant:', companyError);
            return null;
        }

        // 2. Fetch Plan Prices (Separate to be resilient to join issues)
        const { data: plan } = await supabase
            .from('plans')
            .select('*')
            .eq('id', company.plan_tier)
            .single();

        return {
            ...company,
            planId: company.plan_tier,
            createdAt: new Date(company.created_at),
            planDetails: {
                ...company.plan_details,
                type: plan?.type as 'fixed' | 'flex' | 'unlimited',
                monthlyFeeCoversUsage: plan?.monthly_fee_covers_usage || false,
                hardLimits: plan?.default_limits || {},
            },
            limits: plan?.default_limits || {},
            settings: company.privacy_settings || {},
            planName: plan?.name,
            planPrices: plan ? {
                basePrice: Number(plan.base_price),
                llmTokenPrice: Number(plan.llm_token_price),
                messagePrice: Number(plan.message_price),
                sttMinutePrice: Number(plan.stt_minute_price),
                ttsMinutePrice: Number(plan.tts_minute_price)
            } : undefined
        } as unknown as Company;
    }
};
