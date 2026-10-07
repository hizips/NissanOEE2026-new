/** Resolve the Django API base for this page load. */

const DEFAULT_API = 'http://localhost:8000/api';
const LAN_HOST = /^192\.168\.2\.\d{1,3}$/;

export function getApiBaseUrl(): string {
  const configuredUrl = String(import.meta.env.VITE_API_URL || '').trim();
  if (import.meta.env.PROD && !configuredUrl) {
    throw new Error('VITE_API_URL must be set for a production build');
  }
  const envUrl = String(configuredUrl || DEFAULT_API).replace(/\/$/, '');
  if (typeof window === 'undefined') return envUrl;
  const host = window.location.hostname;
  // LAN clients must not call the *client's* localhost — use the machine they opened.
  if (LAN_HOST.test(host)) {
    return `http://${host}:8000/api`;
  }
  return envUrl;
}
