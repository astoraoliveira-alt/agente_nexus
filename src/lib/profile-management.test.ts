import { describe, expect, it } from 'vitest';

import {
  buildProfileRecord,
  sanitizeProfilePermissions,
  togglePermissionIds,
  validateProfileForm,
  type ManagedProfile,
} from '@/lib/profile-management';

const baseProfiles: ManagedProfile[] = [
  {
    id: 'profile-1',
    name: 'Administrador',
    description: 'Perfil administrativo',
    permissions: ['dashboard.view', 'users.view'],
    usersCount: 1,
    isSystem: true,
    tenantId: null,
    status: 'active',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    createdBy: 'Sistema',
    updatedBy: 'Sistema',
  },
];

describe('profile-management', () => {
  it('remove permissões duplicadas e inválidas', () => {
    expect(
      sanitizeProfilePermissions(['dashboard.view', 'dashboard.view', 'fake.permission', 'users.view'])
    ).toEqual(['dashboard.view', 'users.view']);
  });

  it('valida nome duplicado ignorando caixa', () => {
    const result = validateProfileForm(
      {
        name: 'administrador',
        description: 'Outro perfil',
        permissions: ['dashboard.view'],
        status: 'active',
      },
      baseProfiles
    );

    expect(result.valid).toBe(false);
    expect(result.errors.name).toContain('Ja existe');
  });

  it('valida ausência de permissões e permissões inválidas', () => {
    const result = validateProfileForm(
      {
        name: 'Supervisor',
        description: 'Perfil com erros',
        permissions: ['fake.permission'],
        status: 'active',
      },
      baseProfiles
    );

    expect(result.valid).toBe(false);
    expect(result.errors.permissions).toBeTruthy();
    expect(result.sanitizedPermissions).toEqual([]);
  });

  it('aplica bulk add e remove de permissões', () => {
    const added = togglePermissionIds(['dashboard.view'], ['users.view', 'campaigns.view'], true);
    expect(added).toEqual(expect.arrayContaining(['dashboard.view', 'users.view', 'campaigns.view']));

    const removed = togglePermissionIds(added, ['users.view'], false);
    expect(removed).not.toContain('users.view');
    expect(removed).toContain('dashboard.view');
  });

  it('cria novo perfil com metadados de auditoria', () => {
    const result = buildProfileRecord({
      form: {
        name: 'Supervisor',
        description: 'Acompanha a operação',
        permissions: ['dashboard.view', 'users.view'],
        status: 'active',
      },
      existingProfiles: baseProfiles,
      actorName: 'Carlos',
      tenantId: 'tenant-1',
      now: '2026-04-15T12:00:00.000Z',
    });

    expect(result.validation.valid).toBe(true);
    expect(result.profile).toMatchObject({
      name: 'Supervisor',
      description: 'Acompanha a operação',
      status: 'active',
      createdBy: 'Carlos',
      updatedBy: 'Carlos',
      tenantId: 'tenant-1',
    });
    expect(result.profile?.permissions).toEqual(['dashboard.view', 'users.view']);
  });

  it('atualiza perfil existente preservando criação e alterando auditoria', () => {
    const result = buildProfileRecord({
      form: {
        name: 'Administrador',
        description: 'Perfil administrativo atualizado',
        permissions: ['dashboard.view', 'users.view', 'profiles.view'],
        status: 'inactive',
      },
      existingProfiles: baseProfiles,
      actorName: 'Maria',
      editingProfile: baseProfiles[0],
      now: '2026-04-15T15:30:00.000Z',
    });

    expect(result.validation.valid).toBe(true);
    expect(result.profile).toMatchObject({
      id: 'profile-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      createdBy: 'Sistema',
      updatedAt: '2026-04-15T15:30:00.000Z',
      updatedBy: 'Maria',
      status: 'inactive',
    });
    expect(result.profile?.permissions).toContain('profiles.view');
  });
});
