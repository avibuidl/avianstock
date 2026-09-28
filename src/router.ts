// Hash routing, in sixty lines and no dependency.
//
// Hash routes need no server rewrite rule, which is what makes "statically
// hostable" true on IPFS, on a bare bucket, and from a file:// open — not only
// on a host that can be configured to fall back to index.html.

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Route =
  // `at` on the landing page: the six steps, for anyone new (#/join).
  | { name: 'landing'; at?: 'join' }
  | { name: 'compose' }
  | { name: 'flock' }
  | { name: 'bird'; id: number }
  | { name: 'perch' }
  // My Nest (2026-09-27): the holder's one page. `at`: its birds, its
  // rewards or its stake, from the old addresses #/birds and #/roost too.
  | { name: 'nest'; at?: 'birds' | 'rewards' | 'stake' }
  | { name: 'first-light' }
  // `at`: a section or card on the page to open at, from the path's second
  // part (#/docs/contracts, #/bird-engine/roost). The page scrolls to it.
  | { name: 'docs'; at?: string }
  | { name: 'engine'; at?: string }
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
    case 'nest': return arg === 'birds' || arg === 'rewards' || arg === 'stake' ? { name: 'nest', at: arg } : { name: 'nest' };
    // The Nest was once called the incubator; old links keep working rather
    // than dropping someone on the landing page. My Birds and The Roost
    // became sections of My Nest on 2026-09-27, and their addresses open it
    // at that section.
    case 'incubator': return { name: 'nest' };
    case 'birds': return { name: 'nest', at: 'birds' };
    case 'roost': return { name: 'nest', at: 'stake' };
    case 'join': return { name: 'landing', at: 'join' };
    case 'first-light': return { name: 'first-light' };
    case 'docs': return arg ? { name: 'docs', at: arg } : { name: 'docs' };
    // The Contracts page became a section of Docs on 2026-09-25; the old
    // address opens Docs at that section rather than on the landing page.
    case 'contracts': return { name: 'docs', at: 'contracts' };
    // The protocol's machinery, where Contracts was: the Treasury and the
    // Roost. It was "the Flywheel page" for its first day; that address still
    // opens it.
    case 'bird-engine':
    case 'flywheel': return arg ? { name: 'engine', at: arg } : { name: 'engine' };
    // Reachable by typing it, on purpose. The page refuses a wallet that is not
    // the owner, and the CONTRACTS refuse the calls — a route that pretends not
    // to exist would protect nothing and confuse the owner.
    case 'admin': return { name: 'admin' };
    default: return { name: 'landing' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'landing': return route.at ? '#/join' : '#/';
    case 'bird': return `#/bird/${route.id}`;
    case 'nest': return route.at ? `#/nest/${route.at}` : '#/nest';
    case 'docs': return route.at ? `#/docs/${route.at}` : '#/docs';
    case 'engine': return route.at ? `#/bird-engine/${route.at}` : '#/bird-engine';
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
  useEffect(() => { window.scrollTo(0, 0); }, [route.name, (route as { id?: number }).id, (route as { at?: string }).at]);
}

/**
 * Open the page at the element with this id, and keep it there while the
 * page above it settles: cards that land their reads after mount grow, and
 * would otherwise push the section down out of view. It lets go after two
 * seconds, or at once when the reader scrolls, types or touches.
 */
export function useOpenAt(id: string | undefined) {
  useEffect(() => {
    if (!id) return;
    let done = false;
    const place = () => { if (!done) document.getElementById(id)?.scrollIntoView({ block: 'start' }); };
    const stop = () => { done = true; };
    const frame = requestAnimationFrame(place);
    const ro = new ResizeObserver(place);
    ro.observe(document.body);
    const timer = setTimeout(stop, 2000);
    const opts = { passive: true, once: true } as const;
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('touchstart', stop, opts);
    window.addEventListener('keydown', stop, { once: true });
    return () => {
      stop();
      cancelAnimationFrame(frame);
      ro.disconnect();
      clearTimeout(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [id]);
}
