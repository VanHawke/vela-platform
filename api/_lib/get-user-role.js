// api/_lib/get-user-role.js — Shared helper: resolve user's org role
// Returns 'super_admin' | 'admin' | 'user' | null
import { sbFetch } from '../kiko-tools.js';

const cache = new Map();

export async function getUserRole(userId, organizationId) {
  if (!userId) return null;
  const key = `${userId}:${organizationId || 'any'}`;
  if (cache.has(key)) return cache.get(key);

  try {
    let query;
    if (organizationId) {
      query = `organization_members?user_id=eq.${userId}&organization_id=eq.${organizationId}&select=role&limit=1`;
    } else {
      // If no org specified, find user's first org
      query = `organization_members?user_id=eq.${userId}&select=role&limit=1`;
    }
    const rows = await sbFetch(query);
    const role = rows?.[0]?.role || null;
    cache.set(key, role);
    return role;
  } catch {
    return null;
  }
}

export function canExport(role) {
  return role === 'super_admin' || role === 'admin';
}
