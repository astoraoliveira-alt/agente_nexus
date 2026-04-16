import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';

export const AuthService = {
    async getSessionAccessToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    },

    async ensureBusinessUser(): Promise<User | null> {
        const accessToken = await this.getSessionAccessToken();
        if (!accessToken) return null;

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ensure-business-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const responseText = await response.text();
        let payload: any = null;
        try {
            payload = responseText ? JSON.parse(responseText) : null;
        } catch {
            payload = null;
        }

        if (!response.ok) {
            console.error('Error ensuring business user:', payload?.error || response.statusText);
            return null;
        }

        return payload?.data ? this.mapUser(payload.data) : null;
    },

    pickBestUserCandidate(rows: any[], providerId?: string | null): any | null {
        if (!rows?.length) return null;

        const sorted = [...rows].sort((a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        if (providerId) {
            const exactProvider = sorted.find((row) => row.provider_id === providerId);
            if (exactProvider) return exactProvider;
        }

        const invitedOrPending = sorted.find((row) => ['invited', 'pending'].includes(row.status));
        if (invitedOrPending) return invitedOrPending;

        const withoutProvider = sorted.find((row) => !row.provider_id);
        if (withoutProvider) return withoutProvider;

        const active = sorted.find((row) => row.status === 'active');
        if (active) return active;

        return sorted[0];
    },

    /**
     * Finds a user by their Auth Provider ID (e.g. Supabase UID).
     */
    async getUserByProviderId(providerId: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('provider_id', providerId);

        if (error || !data?.length) return null;
        return this.mapUser(this.pickBestUserCandidate(data, providerId));
    },

    /**
     * Finds a user by email.
     */
    async getUserByEmail(email: string): Promise<User | null> {
        const normalizedEmail = email.trim().toLowerCase();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail);

        if (error || !data?.length) return null;
        return this.mapUser(this.pickBestUserCandidate(data));
    },

    /**
     * Links an authenticated provider user to a business user record.
     * Use this when a user logs in but their provider_id is missing in public.users.
     */
    async linkProviderToUser(email: string, providerId: string): Promise<User | null> {
        const normalizedEmail = email.trim().toLowerCase();
        const { data: candidates, error: candidateError } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail);

        if (candidateError || !candidates?.length) {
            console.error('Error finding user to auto-link:', candidateError);
            return null;
        }

        const targetUser = this.pickBestUserCandidate(candidates, providerId);
        if (!targetUser) return null;

        const currentStatus = targetUser.status;
        const hasTenant = !!targetUser.tenant_id;
        const nextStatus = currentStatus === 'invited'
            ? 'active'
            : currentStatus === 'pending'
                ? 'pending'
                : currentStatus || 'active';
        const nextIsActive = nextStatus === 'active';

        const { data, error } = await supabase
            .from('users')
            .update({ 
                provider_id: providerId,
                provider: 'supabase',
                status: nextStatus,
                is_active: nextIsActive
            })
            .eq('id', targetUser.id)
            .select()
            .single();

        if (error) {
            console.error('Error auto-linking user:', error);
            return null;
        }
        return this.mapUser(data);
    },

    /**
     * Creates a new pending user request.
     * This is decoupled from Supabase Auth triggers.
     */
    async createPendingUser(email: string, fullName: string, providerId: string): Promise<User> {
        const { data, error } = await supabase
            .from('users')
            .insert({
                email,
                full_name: fullName,
                provider_id: providerId,
                role: 'operator', // Safe default
                status: 'pending',
                tenant_id: null
            })
            .select()
            .single();

        if (error) throw error;
        return this.mapUser(data);
    },

    /**
     * Invites a new user (Admin function).
     * Does NOT engage Supabase Auth yet, just creates the record.
     */
    async inviteUser(email: string, fullName: string, tenantId: string, role: string = 'operator'): Promise<User> {
        const { data, error } = await supabase
            .from('users')
            .insert({
                email,
                full_name: fullName,
                role,
                status: 'invited',
                tenant_id: tenantId
            })
            .select()
            .single();

        if (error) throw error;
        return this.mapUser(data);
    },

    /**
     * Maps raw DB result to User type.
     */
    mapUser(u: any): User {
        return {
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            profileId: u.profile_id,
            profileName: u.profile_name ?? null,
            tenantId: u.tenant_id,
            isActive: u.status === 'active',
            avatar: u.avatar_url,
            provider_id: u.provider_id,
            provider: u.provider,
            status: u.status,
            owner_id: u.owner_id
        };
    },

    // --- ADMIN METHODS ---

    async getPendingUsers(): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data.map(this.mapUser);
    },

    async approveUser(userId: string, tenantId: string, role: string, profileId?: string | null): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update({
                status: 'active',
                is_active: true,
                tenant_id: tenantId,
                role: role,
                profile_id: profileId ?? null,
            })
            .eq('id', userId);

        if (error) throw error;
    },

    async rejectUser(userId: string): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update({ status: 'blocked' })
            .eq('id', userId);

        if (error) throw error;
    }
};
