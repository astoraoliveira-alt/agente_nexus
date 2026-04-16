import { PERMISSIONS_CATALOG } from '@/lib/permissions';

export type ProfileStatus = 'active' | 'inactive';

export interface ManagedProfile {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  usersCount: number;
  isSystem: boolean;
  systemKey?: string | null;
  tenantId?: string | null;
  status: ProfileStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface EditableProfileForm {
  name: string;
  description: string;
  permissions: string[];
  status: ProfileStatus;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: Partial<Record<'name' | 'description' | 'permissions' | 'status', string>>;
  sanitizedPermissions: string[];
}

const VALID_PERMISSION_IDS = new Set(PERMISSIONS_CATALOG.map((permission) => permission.id));

export function sanitizeProfilePermissions(permissionIds: string[]): string[] {
  return Array.from(new Set(permissionIds.filter((permissionId) => VALID_PERMISSION_IDS.has(permissionId))));
}

export function validateProfileForm(
  form: EditableProfileForm,
  existingProfiles: ManagedProfile[],
  editingProfileId?: string | null
): ProfileValidationResult {
  const errors: ProfileValidationResult['errors'] = {};
  const trimmedName = form.name.trim();
  const trimmedDescription = form.description.trim();
  const sanitizedPermissions = sanitizeProfilePermissions(form.permissions);

  if (!trimmedName) {
    errors.name = 'Informe o nome do perfil.';
  } else {
    const duplicated = existingProfiles.some((profile) =>
      profile.id !== editingProfileId &&
      profile.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicated) {
      errors.name = 'Ja existe um perfil com este nome.';
    }
  }

  if (!trimmedDescription) {
    errors.description = 'Informe uma descricao para o perfil.';
  }

  if (!form.status || !['active', 'inactive'].includes(form.status)) {
    errors.status = 'Selecione um status valido.';
  }

  if (sanitizedPermissions.length === 0) {
    errors.permissions = 'Selecione pelo menos uma permissao.';
  }

  if (sanitizedPermissions.length !== form.permissions.length) {
    errors.permissions = errors.permissions || 'Existem permissoes invalidas na selecao atual.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitizedPermissions,
  };
}

export function togglePermissionIds(currentPermissions: string[], permissionIds: string[], enabled: boolean): string[] {
  const next = new Set(currentPermissions);
  if (enabled) {
    permissionIds.forEach((permissionId) => {
      if (VALID_PERMISSION_IDS.has(permissionId)) next.add(permissionId);
    });
  } else {
    permissionIds.forEach((permissionId) => next.delete(permissionId));
  }
  return Array.from(next);
}

export function buildProfileRecord(params: {
  form: EditableProfileForm;
  existingProfiles: ManagedProfile[];
  actorName: string;
  tenantId?: string | null;
  editingProfile?: ManagedProfile | null;
  now?: string;
}): { profile?: ManagedProfile; validation: ProfileValidationResult } {
  const { form, existingProfiles, actorName, tenantId, editingProfile, now = new Date().toISOString() } = params;
  const validation = validateProfileForm(form, existingProfiles, editingProfile?.id);

  if (!validation.valid) {
    return { validation };
  }

  const baseProfile: ManagedProfile = editingProfile
    ? {
        ...editingProfile,
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: validation.sanitizedPermissions,
        status: form.status,
        updatedAt: now,
        updatedBy: actorName,
      }
    : {
        id: `profile-${Date.now()}`,
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: validation.sanitizedPermissions,
        usersCount: 0,
        isSystem: false,
        tenantId: tenantId ?? null,
        status: form.status,
        createdAt: now,
        updatedAt: now,
        createdBy: actorName,
        updatedBy: actorName,
      };

  return {
    profile: baseProfile,
    validation,
  };
}
