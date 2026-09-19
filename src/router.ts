// Hash routing, in sixty lines and no dependency.
//
// Hash routes need no server rewrite rule, which is what makes "statically
// hostable" true on IPFS, on a bare bucket, and from a file:// open — not only
// on a host that can be configured to fall back to index.html.

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'compose' }
  | { name: 'flock' }
  | { name: 'bird'; id: number }
  | { name: 'perch' }
  | { name: 'nest' }
  | { name: 'roost' }
  | { name: 'birds' }
  | { name: 'first-light' }
  | { name: 'docs' }
  | { name: 'contracts' }
  | { name: 'admin' };

export function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [head, arg] = path.split('/');
  switch (head) {
    case '': return { name: 'landing' };
    case 'compose': return { name: 'compose' };
    case 'flock': return { name: 'flock' };
    case 'bird': return { name: 'bird', id: Number(arg) || 1 };
    case 'perch': return { name: 'perch' };
    case 'nest': return { name: 'nest' };
    // The Nest was once called the incubator; old links keep working rather
    // than dropping someone on the landing page. (It was also briefly "the
    // roost" — that name now belongs to the Roost, the fee splitter, below.)
    case 'incubator': return { name: 'nest' };
    case 'roost': return { name: 'roost' };
    case 'birds': return { name: 'birds' };
    case 'first-light': return { name: 'first-light' };
    case 'docs': return { name: 'docs' };
    case 'contracts': return { name: 'contracts' };
    // Reachable by typing it, on purpose. The page refuses a wallet that is not
    // the owner, and the CONTRACTS refuse the calls — a route that pretends not
    // to exist would protect nothing and confuse the owner.
    case 'admin': return { name: 'admin' };
    default: return { name: 'landing' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'landing': return '#/';
    case 'bird': return `#/bird/${route.id}`;
    default: return `#/${route.name}`;
  }
}

const listeners = new Set<() => void>();
let currentHash = typeof location === 'undefined' ? '#/' : location.hash || '#/';

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentHash = location.hash || '#/';
    listeners.forEach((l) => l());
  });
}

function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => currentHash, () => '#/');
  return parse(hash);
}

export function navigate(route: Route) {
  location.hash = href(route);
}

export function useNavigate() {
  return useCallback((route: Route) => navigate(route), []);
}

/** Every route change starts at the top, the way a page load would. */
export function useScrollReset(route: Route) {
  useEffect(() => { window.scrollTo(0, 0); }, [route.name, (route as { id?: number }).id]);
}
