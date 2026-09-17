import { printifyJson } from "./printify.js";

export const comboKey = (blueprintId: number, printProviderId: number) => `${blueprintId}:${printProviderId}`;

const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { expiresAt: number; value: Map<number, { color: string; size: string }> }>();
const pending = new Map<string, Promise<Map<number, { color: string; size: string }>>>();

async function fetchCombo(key: string, blueprintId: number, printProviderId: number, token: string) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = printifyJson(
    `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((data) => {
    const value = new Map<number, { color: string; size: string }>();
    for (const variant of data.variants ?? []) value.set(variant.id, variant.options);
    cache.set(key, { expiresAt: Date.now() + CACHE_MS, value });
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// Fetches each distinct blueprint+provider combo's catalog variants once (not
// once per row) and maps variant id -> {color, size}. Listing.variants and
// Template.variants only ever store {id, price, is_enabled} — color/size per
// id has to come from Printify's catalog, which is the same for every shop,
// so this is shared between the products list and the templates list.
export async function fetchCatalogOptionsByCombo(
  items: { blueprintId: number; printProviderId: number; accessToken: string }[]
) {
  const combos = new Map<string, { blueprintId: number; printProviderId: number; token: string }>();
  for (const item of items) {
    const key = comboKey(item.blueprintId, item.printProviderId);
    if (!combos.has(key) && item.accessToken) {
      combos.set(key, { blueprintId: item.blueprintId, printProviderId: item.printProviderId, token: item.accessToken });
    }
  }

  const result = new Map<string, Map<number, { color: string; size: string }>>();
  const entries = [...combos.entries()];
  for (let i = 0; i < entries.length; i += 4) {
    await Promise.all(entries.slice(i, i + 4).map(async ([key, { blueprintId, printProviderId, token }]) => {
      try {
        result.set(key, await fetchCombo(key, blueprintId, printProviderId, token));
      } catch {
        // Leave this combo unmapped — callers just omit what they can't resolve.
      }
    }));
  }

  return result;
}
