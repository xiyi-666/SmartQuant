import { getAuthUser } from "./auth";

const PAGE_CACHE_PREFIX = "qs:user-page-cache:v1";
const USER_STORAGE_PREFIX = "qs:user-storage:v1";

type PageCacheEnvelope<T> = {
  version: 1;
  savedAt: number;
  value: T;
};

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizedUserIdentity() {
  const user = getAuthUser();
  if (user?.id !== undefined && user.id !== null) return `id-${user.id}`;
  const username = String(user?.username || "anonymous").trim().toLowerCase();
  return `name-${username || "anonymous"}`;
}

function safeKeyPart(value: string) {
  return encodeURIComponent(String(value || "default").trim().toLowerCase());
}

export function userScopedStorageKey(baseKey: string) {
  return `${USER_STORAGE_PREFIX}:${safeKeyPart(baseKey)}:${safeKeyPart(normalizedUserIdentity())}`;
}

function pageCacheKey(namespace: string, scope: string) {
  return [
    PAGE_CACHE_PREFIX,
    safeKeyPart(normalizedUserIdentity()),
    safeKeyPart(namespace),
    safeKeyPart(scope),
  ].join(":");
}

export function readUserPageCache<T>(
  namespace: string,
  scope: string,
  maxAgeMs: number = Number.POSITIVE_INFINITY,
): PageCacheEnvelope<T> | null {
  if (!storageAvailable()) return null;
  const key = pageCacheKey(namespace, scope);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as PageCacheEnvelope<T> | null;
    if (!parsed || parsed.version !== 1 || !Number.isFinite(Number(parsed.savedAt))) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Number.isFinite(maxAgeMs) && Date.now() - Number(parsed.savedAt) > maxAgeMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeUserPageCache<T>(namespace: string, scope: string, value: T) {
  if (!storageAvailable()) return false;
  try {
    const envelope: PageCacheEnvelope<T> = {
      version: 1,
      savedAt: Date.now(),
      value,
    };
    window.localStorage.setItem(pageCacheKey(namespace, scope), JSON.stringify(envelope));
    return true;
  } catch {
    // Cache storage is opportunistic and must not block the underlying workflow.
    return false;
  }
}

export function clearUserPageCache(namespace: string, scope: string) {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(pageCacheKey(namespace, scope));
}
