import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Gift } from 'lucide-react';
import { useCart } from '@/context/CartContext';

// Floating "pill dock" bottom nav for mobile — Home, Explore, Cart,
// Offers — matching the woohoo.in reference dock exactly. Hidden from
// `md` up (the regular header + desktop nav takes over there).
// Renders above everything (z-50, still under the header's z-[100]
// and the auth modal's z-[200]).
//
// SHAPE & POSITION: content-hugging, NOT stretched. The reference
// dock is only as wide as its 4 icons + 1 expanded label need — it
// does not stretch to fill some fraction of the screen with gaps
// spread between items. So this is `w-fit` and centered with
// `left-1/2 -translate-x-1/2` (not `w-11/12` + `justify-between`,
// which was the earlier version's mistake — that stretched the pill
// wide and spread the icons apart instead of packing them tight).
// `bottom` is set inline so the floating gap grows on devices with a
// home-indicator safe area, instead of the dock sitting flush under it.
//
// GLASSMORPHISM: the outer capsule is a translucent blurred chrome
// (`bg-white/70 backdrop-blur-md`) — but each *inactive* item also
// gets its own solid-white circular "bubble" behind its icon. That
// second layer is what the reference actually shows: distinct white
// coins sitting inside the frosted chrome, not just bare icons
// floating in the blur.
//
// DEFAULT SELECTION: no local "selected tab" state — active state is
// derived from React Router's `useLocation()` on every render, so it
// always reflects the real current URL. On the home route ("/") that
// already makes Home active the moment the component mounts,
// satisfying "Home pre-selected on load" for the normal entry point
// without the nav ever lying about where the user actually is (e.g.
// showing Home active while deep-linked straight into /cart —
// confirmed against the reference video, where navigating to /cart
// collapses Home back to an icon-only circle and expands Cart
// instead).
//
// ACTIVE-STATE MATCHING (bugfix): React Router's `NavLink` computes
// its injected `isActive` from PATHNAME ONLY — it ignores the query
// string entirely. Explore ("/brands") and Offers
// ("/brands?offers=true") share the same pathname, so relying on the
// built-in `isActive` made both light up together any time the URL
// was under /brands, regardless of the `offers` param. Fixed by
// computing active state ourselves from `location.pathname` AND
// `location.search` (see `isItemActive` below) instead of trusting
// NavLink's render-prop `isActive` for styling.
//
// LABEL EXPANSION: every label stays in the DOM at all times (screen
// readers always see it) but collapses to zero width/opacity when
// inactive, expanding smoothly only for the active item.
//
// Mount this once, near the bottom of App.tsx, alongside `!isAdmin &&
// <Footer />`. Give the page's main content wrapper extra mobile
// bottom padding — `pb-24 md:pb-0` — so the floating dock never
// overlaps the last bit of page content or the footer.
interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const items: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/brands', label: 'Explore', icon: Compass },
  { to: '/cart', label: 'Cart', icon: ShoppingBag },
  { to: '/brands?offers=true', label: 'Offers', icon: Gift },
];

export default function BottomNavigation() {
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Single source of truth for "is this tab active" — pathname AND
  // search params both matter, so Explore and Offers (same pathname,
  // different query) can never both resolve to true at once.
  const isOffersActive = new URLSearchParams(location.search).get('offers') === 'true';

  const isItemActive = (item: NavItem): boolean => {
    switch (item.label) {
      case 'Home':
        return location.pathname === '/';
      case 'Explore':
        // Only active on /brands when NOT the offers-filtered view —
        // otherwise this would stay lit up while Offers is also active.
        return location.pathname === '/brands' && !isOffersActive;
      case 'Offers':
        return location.pathname === '/brands' && isOffersActive;
      case 'Cart':
        return location.pathname === '/cart';
      default:
        return location.pathname === item.to;
    }
  };

  return (
    <nav
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 w-fit max-w-[92vw] rounded-full border border-white/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-2xl"
      style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      aria-label="Primary mobile navigation"
    >
      <div className="flex items-center gap-1.5 p-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isCart = item.to === '/cart';
          const isActive = isItemActive(item);

          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                // Offers is a filtered brands view, not its own route —
                // navigate explicitly so the query string is always applied.
                if (item.label === 'Offers') {
                  e.preventDefault();
                  navigate('/brands?offers=true');
                }
              }}
              // Style purely off our own `isActive` (pathname + search),
              // NOT the render-prop isActive NavLink would inject — that
              // one only looks at pathname and is what caused Explore and
              // Offers to fight over the active state.
              className={`group flex h-11 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out ${
                isActive
                  ? 'bg-brand-900 text-white pl-3 pr-4 shadow-md shadow-brand-900/30'
                  : 'w-11 bg-white text-brand-900 dark:bg-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="relative grid shrink-0 place-items-center h-5 w-5">
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                {isCart && count > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 grid place-items-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold ring-2 ${
                      isActive
                        ? 'bg-white text-brand-900 ring-brand-900'
                        : 'bg-brand-600 text-white ring-white dark:ring-slate-800'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </span>
              {/* Label stays in the DOM at all times (screen readers
                  always see it) but collapses to zero width/opacity
                  when inactive, and expands smoothly when active. */}
              <span
                className={`overflow-hidden whitespace-nowrap text-[13px] font-semibold transition-all duration-300 ease-out ${
                  isActive ? 'max-w-[80px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
