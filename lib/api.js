
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('fifa_token') || '';
}
export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('fifa_user');
  return raw ? JSON.parse(raw) : null;
}
export function setSession(data) {
  localStorage.setItem('fifa_token', data.token);
  localStorage.setItem('fifa_user', JSON.stringify(data.user));
}
export function clearSession() {
  localStorage.removeItem('fifa_token');
  localStorage.removeItem('fifa_user');
}

export async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: 'no-store'
  });

  if (response.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/';
    throw new Error('Odhlášeno');
  }
  if (!response.ok) {
    let msg = 'Chyba API';
    try {
      const type = response.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        const json = await response.json();
        msg = json.error || msg;
      } else {
        const text = await response.text();
        msg = text || msg;
      }
    } catch {}
    throw new Error(msg);
  }
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) return response.json();
  return response;
}
