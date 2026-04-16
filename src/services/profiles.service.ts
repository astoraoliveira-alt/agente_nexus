import { supabase } from '@/lib/supabase';
import { Profile, User } from '@/lib/types';
import { ManagedProfile } from '@/lib/profile-management';

function mapProfileRow(row: any, permissions: string[] = [], usersCount = 0): ManagedProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    permissions,
    usersCount,
    isSystem: !!row.is_system,
    systemKey: row.system_key,
    tenantId: row.tenant_id,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by_name || row.created_by || 'Sistema',
    updatedBy: row.updated_by_name || row.updated_by || 'Sistema',
  };
}

export const profilesService = {
  async getProfiles(tenantId?: string | null): Promise<ManagedProfile[]> {
    const profileQuery = supabase
      .from('profiles')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    const scopedQuery = tenantId
      ? profileQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      : profileQuery.is('tenant_id', null);

    const { data: profileRows, error: profileError } = await scopedQuery;
    if (profileError) throw profileError;

    const profileIds = (profileRows || []).map((profile) => profile.id);
    if (profileIds.length === 0) return [];

    const [{ data: permissionRows, error: permissionError }, { data: usersRows, error: usersError }] = await Promise.all([
      supabase
        .from('profile_permissions')
        .select('profile_id, permission_id')
        .in('profile_id', profileIds),
      supabase
        .from('users')
        .select('id, profile_id')
        .in('profile_id', profileIds),
    ]);

    if (permissionError) throw permissionError;
    if (usersError) throw usersError;

    const permissionsByProfile = new Map<string, string[]>();
    for (const row of permissionRows || []) {
      const current = permissionsByProfile.get(row.profile_id) || [];
      current.push(row.permission_id);
      permissionsByProfile.set(row.profile_id, current);
    }

    const usersCountByProfile = new Map<string, number>();
    for (const row of usersRows || []) {
      if (!row.profile_id) continue;
      usersCountByProfile.set(row.profile_id, (usersCountByProfile.get(row.profile_id) || 0) + 1);
    }

    return (profileRows || []).map((row) =>
      mapProfileRow(
        row,
        permissionsByProfile.get(row.id) || [],
        usersCountByProfile.get(row.id) || 0
      )
    );
  },

  async getProfilePermissions(profileId?: string | null): Promise<string[]> {
    if (!profileId) return [];
    const { data, error } = await supabase
      .from('profile_permissions')
      .select('permission_id')
      .eq('profile_id', profileId);

    if (error) throw error;
    return (data || []).map((row) => row.permission_id);
  },

  async saveProfile(profile: ManagedProfile, actorUserId?: string | null): Promise<ManagedProfile> {
    const profilePayload = {
      name: profile.name,
      description: profile.description,
      is_system: profile.isSystem,
      system_key: profile.systemKey || null,
      tenant_id: profile.tenantId || null,
      status: profile.status,
      created_by: actorUserId || null,
      updated_by: actorUserId || null,
    };

    let savedProfileId = profile.id;

    if (profile.id.startsWith('profile-')) {
      const { data, error } = await supabase
        .from('profiles')
        .insert(profilePayload)
        .select('*')
        .single();

      if (error) throw error;
      savedProfileId = data.id;
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ ...profilePayload, updated_by: actorUserId || null })
        .eq('id', profile.id);

      if (error) throw error;
    }

    const { error: deletePermissionsError } = await supabase
      .from('profile_permissions')
      .delete()
      .eq('profile_id', savedProfileId);

    if (deletePermissionsError) throw deletePermissionsError;

    if (profile.permissions.length > 0) {
      const { error: insertPermissionsError } = await supabase
        .from('profile_permissions')
        .insert(profile.permissions.map((permissionId) => ({
          profile_id: savedProfileId,
          permission_id: permissionId,
        })));

      if (insertPermissionsError) throw insertPermissionsError;
    }

    const refreshed = await this.getProfiles(profile.tenantId || null);
    const result = refreshed.find((item) => item.id === savedProfileId);
    if (!result) throw new Error('Perfil salvo mas não encontrado na recarga.');
    return result;
  },

  async deleteProfile(profileId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profileId);

    if (error) throw error;
  },

  async getUsersByProfile(profileId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('profile_id', profileId)
      .order('full_name', { ascending: true });

    if (error) throw error;

    return (data || []).map((user) => ({
      ...user,
      name: user.full_name,
      tenantId: user.tenant_id,
      isActive: user.is_active,
      profileId: user.profile_id,
    })) as User[];
  },
};

