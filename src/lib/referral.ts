/** Client-side referral capture: keeps a shared ?ref= code alive until signup completes. */

const KEY = "ad4you_ref";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Stored = { code: string; at: number };

/** Reads ?ref= (or ?referral=/?r=) from the current URL and persists it. Returns the code. */
export function captureRefFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ref") || params.get("referral") || params.get("r");
  const code = raw?.trim();
  if (!code || code.length < 3) return getStoredRef();
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies Stored));
  } catch { /* storage unavailable */ }
  return code;
}

export function getStoredRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.code || Date.now() - parsed.at > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearStoredRef() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
