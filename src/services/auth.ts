import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';

export const AuthService = {
    /**
     * Finds a user by their Auth Provider ID (e.g. Supabase UID).
     */
    async getUserByProviderId(providerId: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('provider_id', providerId)
            .single();

        if (error || !data) return null;
        return this.mapUser(data);
    },

    /**
     * Finds a user by email.
     */
    async getUserByEmail(email: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) return null;
        return this.mapUser(data);
    },

    /**
     * Links an authenticated provider user to a business user record.
     * Use this when a user logs in but their provider_id is missing in public.users.
     */
    async linkProviderToUser(email: string, providerId: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .update({ provider_id: providerId })
            .eq('email', email)
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

    async approveUser(userId: string, tenantId: string, role: string): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update({
                status: 'active',
                tenant_id: tenantId,
                role: role
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
