import { supabase } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const incidentsService = {
async getIncidents(tenant_id: string): Promise<import('@/lib/types').AIIncident[]> {
        // If we already know metadata is failing, use basic query immediately
        if (!this._capabilities.conversations && !this._capabilities.resolver && !this._capabilities.agents) {
            const { data, error } = await supabase
                .from('incidents')
                .select('*')
                .eq('tenant_id', tenant_id)
                .order('created_at', { ascending: false });
            if (error) return [];
            return (data || []).map(this._mapIncident);
        }

        let data, error;

        // 1. Build the dynamic select string based on detected capabilities
        const selectParts = ['*'];
        if (this._capabilities.agents) selectParts.push('agents(name)');
        if (this._capabilities.conversations) selectParts.push('conversations(user_name, user_identifier)');
        if (this._capabilities.resolver) selectParts.push('resolver:users!resolved_by(full_name)');

        const selectQuery = selectParts.join(', ');

        const result = await supabase
            .from('incidents')
            .select(selectQuery)
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;

        if (error && (error.code === 'PGRST200' || error.code === 'PGRST204' || error.code === '42703' || (error as any).status === 400)) {
            const msg = error.message?.toLowerCase() || '';

            console.warn('Incident fetch metadata failed, retrying base query', error);

            if (msg.includes('conversations')) this._capabilities.conversations = false;
            if (msg.includes('resolver') || msg.includes('resolved_by')) this._capabilities.resolver = false;
            // No specific 'agents' capability flag, agents(name) is usually always present.
            // If it fails, the base query will still include it if it exists.

            const basicResult = await supabase
                .from('incidents')
                .select('*') // Select all columns, including agents(name) if it exists
                .eq('tenant_id', tenant_id)
                .order('created_at', { ascending: false });

            data = basicResult.data; // Update data with the result of the basic query
            error = basicResult.error;
        }

        if (error) {
            console.error('Error fetching incidents (Base Fallback Failed):', error);
            return [];
        }

        return (data || []).map((i: any) => ({
            id: i.id,
            tenantId: i.tenant_id,
            conversationId: i.conversation_id,
            agentId: i.agent_id,
            severity: i.severity,
            title: i.title,
            description: i.description,
            status: i.status,
            reportedBy: i.reported_by,
            createdAt: new Date(i.created_at),
            resolvedAt: i.resolved_at ? new Date(i.resolved_at) : undefined,
            resolvedBy: i.resolved_by,
            resolverName: i.resolver?.full_name,
            attachments: i.attachments || [],
            agentName: i.agents?.name,
            userName: i.conversations?.user_name,
            userIdentifier: i.conversations?.user_identifier,
            actionTaken: i.action_taken
        }));
    },

async createIncident(incident: Partial<import('@/lib/types').AIIncident>): Promise<void> {
        const payload: any = {
            tenant_id: incident.tenantId,
            agent_id: incident.agentId,
            title: incident.title,
            description: incident.description,
            severity: incident.severity,
            status: incident.status,
            reported_by: incident.reportedBy,
            attachments: incident.attachments || [],
        };

        const id = incident.id;
        let result;

        if (id) {
            // Explicit Update
            result = await supabase
                .from('incidents')
                .update({ ...payload, updated_at: new Date() })
                .eq('id', id);

            if (result.error && (result.error.code === '42703' || result.error.code === 'PGRST204')) {
                result = await supabase
                    .from('incidents')
                    .update(payload)
                    .eq('id', id);
            }
        } else {
            // Explicit Insert
            result = await supabase
                .from('incidents')
                .insert({ ...payload, updated_at: new Date() });

            if (result.error && (result.error.code === '42703' || result.error.code === 'PGRST204')) {
                result = await supabase
                    .from('incidents')
                    .insert(payload);
            }
        }

        if (result.error) throw result.error;
    },

async deleteIncident(id: string): Promise<void> {
        const { error } = await supabase
            .from('incidents')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

async resolveIncident(id: string, actionTaken: string, resolvedBy?: string, attachments?: any[]): Promise<void> {
        const payload: any = {
            status: 'resolved',
            resolved_at: new Date()
        };

        // Only add rich metadata if we think the columns exist
        if (this._capabilities.resolver) {
            payload.action_taken = actionTaken;
            payload.resolved_by = resolvedBy;
            payload.attachments = attachments || [];
        }

        let { error } = await supabase
            .from('incidents')
            .update(payload)
            .eq('id', id);

        if (error && (error.code === 'PGRST200' || error.code === 'PGRST204' || error.code === '42703' || (error as any).status === 400)) {
            console.warn('Metadata resolution failed, retrying with base columns only');
            this._capabilities.resolver = false;

            const basicResult = await supabase
                .from('incidents')
                .update({
                    status: 'resolved',
                    resolved_at: new Date()
                })
                .eq('id', id);

            error = basicResult.error;
        }

        if (error) throw error;
    },

async uploadIncidentAttachment(file: File): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('incident-attachments')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
            .from('incident-attachments')
            .getPublicUrl(filePath);

        return data.publicUrl;
    }
};
