import { supabase } from '@/lib/supabase';
import { SystemIncident } from '@/lib/types';

export const systemIncidentsService = {
  async getSystemIncidents(tenant_id: string): Promise<SystemIncident[]> {
    const { data, error } = await supabase
      .from('system_incidents')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching system incidents:', error);
      return [];
    }

    return data || [];
  },

  async createSystemIncident(incident: Partial<SystemIncident>): Promise<SystemIncident> {
    const { data, error } = await supabase
      .from('system_incidents')
      .insert(incident)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSystemIncident(id: string, updates: Partial<SystemIncident>): Promise<SystemIncident> {
    const { data, error } = await supabase
      .from('system_incidents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteSystemIncident(id: string): Promise<void> {
    const { error } = await supabase
      .from('system_incidents')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async resolveSystemIncident(id: string): Promise<void> {
    const { error } = await supabase
      .from('system_incidents')
      .update({ 
        status: 'resolved', 
        resolved_at: new Date().toISOString() 
      })
      .eq('id', id);

    if (error) throw error;
  },

  async triggerIncidentBroadcast(incidentId: string, tenantId: string, leadIds?: string[]): Promise<void> {
    const { error } = await supabase.rpc('fn_trigger_incident_broadcast', {
      p_incident_id: incidentId,
      p_tenant_id: tenantId,
      p_lead_ids: leadIds || null
    });
    
    if (error) {
      console.error('Broadcast RPC Error:', error);
      throw error;
    }
  },

  async getBroadcastPreview(incidentId: string, tenantId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('fn_get_broadcast_preview', {
      p_incident_id: incidentId,
      p_tenant_id: tenantId
    });

    if (error) throw error;
    return data || [];
  },

  async getIncidentDeliveryLogs(incidentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        status,
        created_at,
        sender_name,
        metadata,
        conversation_id
      `)
      .eq('metadata->>incident_id', incidentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
