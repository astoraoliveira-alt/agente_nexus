import { supabase } from '@/lib/supabase';
import { Contact } from '@/lib/types';

export interface ObjectionContact extends Contact {
    objection_reason: string;
    conversation_id?: string;
}

export const objectionsService = {
    async getObjectionContacts(tenantId: string): Promise<ObjectionContact[]> {
        const { data, error } = await supabase
            .rpc('get_objection_contacts', {
                p_tenant_id: tenantId
            });

        if (error) {
            console.error('Error fetching objection contacts:', error);
            return [];
        }

        return data.map((c: any) => ({
            id: c.id,
            tenantId: c.tenant_id,
            name: c.name,
            identifier: c.identifier,
            email: c.email,
            phone: c.phone,
            avatarUrl: c.avatar_url,
            tags: c.tags,
            channel: c.channel,
            extraInfo: c.extra_info,
            lifecycleStatus: c.lifecycle_status || 'lead',
            status: c.status,
            sentiment: c.sentiment,
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at),
            objection_reason: c.objection_reason,
            conversation_id: c.conversation_id
        })) as ObjectionContact[];
    }
};
