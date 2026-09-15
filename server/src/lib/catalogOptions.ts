export const comboKey = (blueprintId: number, printProviderId: number) => `${blueprintId}:${printProviderId}`;

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
  await Promise.all([...combos.entries()].map(async ([key, { blueprintId, printProviderId, token }]) => {
    try {
      const res = await fetch(
        `https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json() as any;
      const map = new Map<number, { color: string; size: string }>();
      for (const v of data.variants ?? []) map.set(v.id, v.options);
      result.set(key, map);
    } catch {
      // Leave this combo unmapped — callers just omit what they can't resolve.
    }
  }));

  return result;
}
