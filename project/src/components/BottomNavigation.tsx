import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Gift } from 'lucide-react';
import { useCart } from '@/context/CartContext';

// Floating "pill dock" bottom nav for mobile — Home, Explore, Cart,
// Offers — styled after macOS/iOS docks. Hidden from `md` up (the
// regular header + desktop nav takes over there). Renders above
// everything (z-50, still under the header's z-[100] and the auth
// modal's z-[200]).
//
// SHAPE & POSITION: a short, centered capsule (`w-11/12 max-w-xs
// sm:max-w-md mx-auto`, `rounded-full`) floating above the bottom
// edge, not a full-width bar. `bottom` is set inline (rather than
// only a `bottom-4` class) so the floating gap itself grows on
// devices with a home-indicator safe area, instead of the dock
// sitting flush under it.
//
// TRANSPARENCY: `bg-white/70 dark:bg-slate-900/70` + `backdrop-blur-md`
// so page content shows through faintly as it scrolls underneath.
//
// DEFAULT SELECTION: there is deliberately no local "selected tab"
// state here — `isActive` comes from React Router's NavLink and
// reflects the real current URL. On the home route ("/") that
// already makes Home active the moment the component mounts, which
// satisfies "Home pre-selected on load" for the normal entry point
// without the nav ever lying about where the user actually is (e.g.
// showing Home as active while deep-linked straight into /cart).
//
// LABEL EXPANSION: every item keeps its label in the DOM at all
// times (good for screen readers) but the inactive ones collapse it
// to zero width/opacity via a CSS transition, so only the active
// item's icon+label pill is visibly expanded — the compact-dock,
// expand-on-select effect — and it animates smoothly whether the
// change came from a click or from routing elsewhere.
//
// Mount this once, near the bottom of App.tsx, alongside `!isAdmin &&
// <Footer />`. Because the dock floats above the edge instead of
// sitting flush against it, give the page's main content wrapper a
// bit more mobile bottom padding than a flush bar would need —
// `pb-24 md:pb-0` — so it never overlaps the last bit of page
// content or the footer.
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

  return (
    <nav
      className="md:hidden fixed inset-x-0 z-50 mx-auto w-11/12 max-w-xs sm:max-w-md rounded-full border border-white/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-2xl"
      style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      aria-label="Primary mobile navigation"
    >
      <div className="flex items-center justify-between gap-1 px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isCart = item.to === '/cart';
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              onClick={(e) => {
                // Offers is a filtered brands view, not its own route —
                // navigate explicitly so the query string is always applied.
                if (item.label === 'Offers') {
                  e.preventDefault();
                  navigate('/brands?offers=true');
                }
              }}
              className={({ isActive }) =>
                `group flex items-center rounded-full transition-all duration-300 ease-out shrink-0 ${
                  isActive
                    ? 'bg-brand-600 text-white pl-3 pr-4 py-2.5 shadow-md shadow-brand-600/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 p-2.5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative grid shrink-0 place-items-center h-5 w-5">
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                    {isCart && count > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-2 grid place-items-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold ring-2 ${
                          isActive
                            ? 'bg-white text-brand-700 ring-brand-600'
                            : 'bg-brand-600 text-white ring-white dark:ring-slate-900'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {/* Label stays in the DOM at all times (screen readers
                      always see it) but collapses to zero width/opacity
                      when inactive, and expands smoothly when active —
                      the compact-icon / expand-on-select dock effect. */}
                  <span
                    className={`overflow-hidden whitespace-nowrap text-[13px] font-semibold transition-all duration-300 ease-out ${
                      isActive ? 'max-w-[80px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
