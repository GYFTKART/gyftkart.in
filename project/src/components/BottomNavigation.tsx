import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Gift } from 'lucide-react';
import { useCart } from '@/context/CartContext';

// Floating "dock" bottom nav for mobile — Home, Explore, Cart, Offers.
// Hidden from `md` up (the regular header + desktop nav takes over
// there). Renders above everything (z-50, still under the header's
// z-[100] and the auth modal's z-[200]).
//
// Floats inset from all three edges (bottom-4 / left-4 / right-4)
// as a rounded, blurred, shadowed capsule rather than a flush
// full-width bar — matching the woohoo.in-style dock reference.
// `bottom` is set inline (not just the bottom-4 class) so the gap
// itself grows on devices with a home-indicator safe area, instead
// of the bar sitting flush under it.
//
// Mount this once, near the bottom of App.tsx, alongside `!isAdmin &&
// <Footer />`. Because the bar now floats above the edge instead of
// sitting flush against it, give the page's main content wrapper a
// bit more mobile bottom padding than before — `pb-24 md:pb-0` — so
// the floating dock never overlaps the last bit of page content or
// the footer.
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
      className="md:hidden fixed left-4 right-4 z-50 rounded-2xl border border-slate-100/80 bg-white/90 backdrop-blur-md shadow-xl shadow-slate-900/10"
      style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      aria-label="Primary mobile navigation"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isCart = item.to === '/cart';
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              onClick={(e) => {
                // Offers is a filtered brands view, not its own route —
                // navigate explicitly so the query string is always applied.
                if (item.label === 'Offers') {
                  e.preventDefault();
                  navigate('/brands?offers=true');
                }
              }}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative grid place-items-center h-6 w-6">
                    <Icon
                      className="h-5 w-5"
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                    {isCart && count > 0 && (
                      <span className="absolute -top-1.5 -right-2 grid place-items-center h-4 min-w-[16px] px-1 rounded-full bg-brand-600 text-white text-[9px] font-bold ring-2 ring-white">
                        {count}
                      </span>
                    )}
                  </span>
                  {item.label}
                  {isActive && (
                    <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
