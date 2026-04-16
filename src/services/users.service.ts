import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';
import { getSetPasswordUrl } from '@/lib/app-url';

export const usersService = {
async getFunctionAuthHeaders(): Promise<Record<string, string>> {
        let { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Error getting Supabase session for function call:', error);
            throw error;
        }

        let accessToken = data.session?.access_token;
        const expiresAt = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
        const shouldRefresh = !accessToken || (expiresAt > 0 && expiresAt <= Date.now() + 60_000);

        if (shouldRefresh) {
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed.error) {
                console.error('Error refreshing Supabase session for function call:', refreshed.error);
                throw refreshed.error;
            }
            accessToken = refreshed.data.session?.access_token ?? null;
        }

        if (!accessToken) {
            throw new Error('Sessão Supabase não encontrada. Faça login novamente antes de enviar convites.');
        }

        return {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
        };
    },

async invokeInviteUser(payload: Record<string, unknown>): Promise<any> {
        const headers = await this.getFunctionAuthHeaders();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        let parsedBody: any = null;
        try {
            parsedBody = responseText ? JSON.parse(responseText) : null;
        } catch {
            parsedBody = { error: responseText };
        }

        if (!response.ok) {
            console.error('EDGE FUNCTION RAW RESPONSE:', responseText);
            let errorMessage = "Unknown error";
            if (typeof parsedBody?.error === 'string') {
              errorMessage = parsedBody.error;
            } else if (parsedBody?.error?.message) {
              errorMessage = parsedBody.error.message;
            } else if (parsedBody?.error) {
              errorMessage = JSON.stringify(parsedBody.error);
            } else {
              errorMessage = `Edge Function invite-user retornou ${response.status}: ${responseText}`;
            }
            
            const error = new Error(errorMessage) as Error & { status?: number; payload?: any };
            error.status = response.status;
            error.payload = parsedBody;
            throw error;
        }

        return parsedBody;
    },

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
            tenantId: data.tenant_id,
            profileId: data.profile_id,
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
            isActive: u.is_active,
            profileId: u.profile_id,
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
            tenantId: data.tenant_id,
            profileId: data.profile_id,
        } as unknown as User;
    },

async createUser(user: Partial<User>): Promise<User> {
        const redirectTo = getSetPasswordUrl();
        const data = await this.invokeInviteUser({
            email: user.email,
            fullName: user.name,
            tenantId: user.tenantId,
            role: user.role,
            profileId: user.profileId,
            redirectTo,
        });

        const invitedUser = data?.data;
        if (!invitedUser) {
            throw new Error('Invalid invite-user response');
        }

        return {
            id: invitedUser.id,
            name: invitedUser.name,
            email: invitedUser.email,
            role: invitedUser.role,
            profileId: invitedUser.profile_id ?? null,
            tenantId: invitedUser.tenantId,
            isActive: invitedUser.isActive,
            provider_id: invitedUser.provider_id,
            provider: invitedUser.provider,
            status: invitedUser.status,
            owner_id: invitedUser.owner_id,
        } as User;
    },

async resendInvite(user: Partial<User>): Promise<User> {
        const redirectTo = getSetPasswordUrl();
        const data = await this.invokeInviteUser({
            userId: user.id,
            email: user.email,
            fullName: user.name,
            tenantId: user.tenantId,
            role: user.role,
            profileId: user.profileId,
            redirectTo,
        });

        const invitedUser = data?.data;
        if (!invitedUser) {
            throw new Error('Invalid invite-user response');
        }

        return {
            id: invitedUser.id,
            name: invitedUser.name,
            email: invitedUser.email,
            role: invitedUser.role,
            profileId: invitedUser.profile_id ?? null,
            tenantId: invitedUser.tenantId,
            isActive: invitedUser.isActive,
            provider_id: invitedUser.provider_id,
            provider: invitedUser.provider,
            status: invitedUser.status,
            owner_id: invitedUser.owner_id,
        } as User;
    },

async updateUser(userId: string, updates: Partial<User>): Promise<User> {
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.full_name = updates.name;
        if (updates.email) dbUpdates.email = updates.email;
        if (updates.role) dbUpdates.role = updates.role;
        if (updates.avatar) dbUpdates.avatar_url = updates.avatar;
        if (Object.prototype.hasOwnProperty.call(updates, 'profileId')) dbUpdates.profile_id = updates.profileId;

        // Use the new RPC to bypass recursive RLS policies causing PGRST116 during user updates
        const { data, error } = await supabase
            .rpc('update_user_profile', {
                p_user_id: userId,
                p_full_name: dbUpdates.full_name,
                p_email: dbUpdates.email,
                p_avatar_url: dbUpdates.avatar_url
            });

        // Fallback to standard update if RPC doesn't exist yet (in case script wasn't run)
        let finalData = data;
        let finalError = error;

        if (error && error.message.includes('Could not find the function')) {
            const fallback = await supabase
                .from('users')
                .update(dbUpdates)
                .eq('id', userId)
                .select()
                .single();
            finalData = fallback.data;
            finalError = fallback.error;
        }

        if (finalError) {
            console.error('Error updating user:', finalError);
            throw finalError;
        }

        return {
            id: finalData.id,
            name: finalData.full_name,
            email: finalData.email,
            role: finalData.role,
            profileId: finalData.profile_id,
            tenantId: finalData.tenant_id,
            isActive: finalData.is_active
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
                basePrice: Number(company.plan_prices?.monthly_flat ?? plan.base_price),
                llmTokenPrice: Number(company.plan_prices?.tokens_per_1k ?? plan.llm_token_price),
                messagePrice: Number(company.plan_prices?.message_flat ?? plan.message_price),
                sttMinutePrice: Number(company.plan_prices?.stt_minute ?? plan.stt_minute_price),
                ttsMinutePrice: Number(company.plan_prices?.tts_minute ?? plan.tts_minute_price)
            } : undefined
        } as unknown as Company;
    }
};
