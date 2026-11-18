const cleanBaseUrl = value => String(value || '').trim().replace(/\/+$/, '');

export const connectionSettings = {
  get() {
    return {
      baseUrl: cleanBaseUrl(localStorage.getItem('hozourban-api-url')),
      organizationId: localStorage.getItem('hozourban-org-id') || '',
    };
  },
  save({ baseUrl, organizationId }) {
    const url = cleanBaseUrl(baseUrl);
    if (!/^https?:\/\//i.test(url)) throw new Error('آدرس سرور باید با https:// شروع شود.');
    if (location.protocol === 'https:' && url.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(url)) {
      throw new Error('برای اتصال امن، آدرس سرور باید HTTPS باشد.');
    }
    localStorage.setItem('hozourban-api-url', url);
    localStorage.setItem('hozourban-org-id', organizationId.trim());
  },
  clearSession() { localStorage.removeItem('hozourban-token'); localStorage.removeItem('hozourban-user'); },
  token() { return localStorage.getItem('hozourban-token') || ''; },
  user() { try { return JSON.parse(localStorage.getItem('hozourban-user') || 'null'); } catch { return null; } },
  setSession(data) {
    localStorage.setItem('hozourban-token', data.token);
    localStorage.setItem('hozourban-user', JSON.stringify(data.user));
  },
};

export async function apiRequest(path, options = {}) {
  const { baseUrl } = connectionSettings.get();
  if (!baseUrl) throw new Error('ابتدا آدرس سرور را در تنظیمات اتصال وارد کنید.');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = connectionSettings.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  } catch {
    throw new Error('ارتباط با سرور برقرار نشد. آدرس، اینترنت و فعال بودن سرور را بررسی کنید.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) connectionSettings.clearSession();
    throw new Error(data.error || `خطای سرور (${response.status})`);
  }
  return data;
}

export async function checkServer() {
  return apiRequest('/api/health', { method: 'GET' });
}
