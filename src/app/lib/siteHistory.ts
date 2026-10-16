export type SiteVisit = { key: string; path: string };

// Provenance only: Router still owns the browser history and all navigation.
export function rememberSiteVisit(visits: Map<number, SiteVisit>, index: unknown,
  location: { key: string; pathname: string; search: string; hash: string }, action: string): SiteVisit | null {
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    visits.clear();
    return null;
  }
  if (action === 'POP' && visits.get(index)?.key !== location.key) visits.clear();
  const lastIndex = [...visits.keys()].at(-1);
  if (action === 'PUSH') {
    // Batched pushes may skip a commit; discard the entire old forward branch.
    for (const key of visits.keys()) if (key > (lastIndex ?? -1) || key >= index) visits.delete(key);
  } else if (action === 'REPLACE' && lastIndex !== undefined && index !== lastIndex) visits.clear();
  const previous = action === 'PUSH' && index !== (lastIndex ?? -2) + 1 ? null : visits.get(index - 1) || null;
  visits.delete(index);
  visits.set(index, { key: location.key, path: location.pathname + location.search + location.hash });
  if (visits.size > 100) visits.delete(visits.keys().next().value!);
  return previous;
}
