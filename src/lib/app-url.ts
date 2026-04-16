export function getPublicAppUrl(): string {
  const configuredUrl = import.meta.env.VITE_APP_PUBLIC_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  return '';
}

export function getSetPasswordUrl(): string | undefined {
  const baseUrl = getPublicAppUrl();
  return baseUrl ? `${baseUrl}/set-password` : undefined;
}
