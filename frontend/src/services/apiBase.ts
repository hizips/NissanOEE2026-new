/** Resolve the Django API base for this page load. */

const DEFAULT_API = 'http://localhost:8000/api';
const LAN_HOST = /^192\.168\.2\.\d{1,3}$/;

export function getApiBaseUrl(): string {
  const envUrl = String(import.meta.env.VITE_API_URL || DEFAULT_API).replace(/\/$/, '');
  if (typeof window === 'undefined') return envUrl;
  const host = window.location.hostname;
  // LAN clients must not call the *client's* localhost — use the machine they opened.
  if (LAN_HOST.test(host)) {
    return `http://${host}:8000/api`;
  }
  return envUrl;
}
