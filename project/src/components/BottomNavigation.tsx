import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Gift } from 'lucide-react';
import { useCart } from '@/context/CartContext';

// Fixed/floating bottom nav for mobile — Home, Explore, Cart, Offers.
// Hidden from `md` up (the regular header + desktop nav takes over
// there). Renders above everything (z-[90], just under the header's
// z-[100] and the auth modal's z-[200]) and pads itself for iOS home-
// indicator safe areas so it never sits under the swipe gesture bar.
//
// Mount this once, near the bottom of App.tsx, alongside `!isAdmin &&
// <Footer />` — and add matching bottom padding to the page's main
// content wrapper on mobile (see the `pb-16 md:pb-0` note in App.tsx)
// so this bar never overlaps the last bit of page content or the
// footer.
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
      className="md:hidden fixed bottom-0 inset-x-0 z-[90] border-t border-slate-100 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.12)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
