const SESSION_KEY = 'gv_session';

export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
        `gv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `gv-fallback-${Date.now()}`;
  }
}
