import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CartItem } from '@/lib/types';
import { useAuth } from '@/context/CustomerAuthContext';
import { supabase } from '@/lib/supabase';

interface CartContextValue {
  items: CartItem[];
  add: (item: Omit<CartItem, 'id'>) => void;
  remove: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  count: number;
  subtotal: number;
  /** True while the cart is being fetched/merged from Supabase. */
  syncing: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const GUEST_CART_KEY = 'gv_cart:guest';

// Columns we round-trip with Supabase — deliberately excludes user_id,
// created_at, updated_at, which the UI never needs to see.
const CART_COLUMNS =
  'id, brand_slug, brand_name, brand_color, brand_color2, category, amount, quantity, recipient_name, recipient_email, recipient_phone, message, occasion';

function readGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function writeGuestCart(items: CartItem[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function newLocalId(): string {
  return (
    (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
    `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

async function fetchRemoteCart(): Promise<CartItem[]> {
  const { data, error } = await supabase
    .from('cart_items')
    .select(CART_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch cart from Supabase:', error.message);
    return [];
  }
  return (data ?? []) as unknown as CartItem[];
}

async function insertRemoteItem(item: Omit<CartItem, 'id'>): Promise<CartItem | null> {
  const { data, error } = await supabase
    .from('cart_items')
    .insert(item)
    .select(CART_COLUMNS)
    .single();

  if (error) {
    console.error('Failed to add cart item to Supabase:', error.message);
    return null;
  }
  return data as unknown as CartItem;
}

async function insertRemoteItems(items: CartItem[]): Promise<CartItem[]> {
  if (items.length === 0) return [];
  // Drop the local (guest) id so Supabase generates a fresh uuid for each
  // migrated row — guest ids may not be valid/unique uuids.
  const rows = items.map(({ id: _localId, ...rest }) => rest);
  const { data, error } = await supabase.from('cart_items').insert(rows).select(CART_COLUMNS);

  if (error) {
    console.error('Failed to migrate guest cart to Supabase:', error.message);
    return [];
  }
  return (data ?? []) as unknown as CartItem[];
}

async function deleteRemoteItem(id: string) {
  const { error } = await supabase.from('cart_items').delete().eq('id', id);
  if (error) console.error('Failed to remove cart item from Supabase:', error.message);
}

async function updateRemoteQuantity(id: string, quantity: number) {
  const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', id);
  if (error) console.error('Failed to update cart item quantity in Supabase:', error.message);
}

async function clearRemoteCart() {
  // Supabase requires a filter on delete; this matches every real row
  // since no cart item will ever have the all-zero uuid.
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) console.error('Failed to clear Supabase cart:', error.message);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const isAuthed = Boolean(session?.email);

  const [items, setItems] = useState<CartItem[]>(() => readGuestCart());
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Tracks whether the *previous* render was authenticated, so we can
  // tell a fresh login (guest -> authed) apart from "still logged in,
  // just re-rendering" and from a logout.
  const wasAuthedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function syncOnAuthChange() {
      if (isAuthed) {
        setSyncing(true);
        try {
          if (!wasAuthedRef.current) {
            // Fresh login: push whatever was sitting in the guest cart
            // into this account's Supabase cart, then clear the guest
            // bucket so it never gets merged twice.
            const guestItems = readGuestCart();
            const [migrated, remote] = await Promise.all([
              insertRemoteItems(guestItems),
              fetchRemoteCart(),
            ]);
            if (cancelled) return;

            writeGuestCart([]);

            const merged = [...remote, ...migrated].filter(
              (item, index, arr) => arr.findIndex((i) => i.id === item.id) === index
            );
            setItems(merged);
          } else {
            // Already logged in (e.g. tab refocus, other tab changed
            // the cart) — just refresh from the database.
            const remote = await fetchRemoteCart();
            if (cancelled) return;
            setItems(remote);
          }
        } finally {
          if (!cancelled) setSyncing(false);
        }
      } else {
        // Logged out (or never logged in): fall back to the local
        // guest cart.
        setItems(readGuestCart());
      }
      wasAuthedRef.current = isAuthed;
    }

    syncOnAuthChange();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, session?.email]);

  // Guests keep their cart mirrored to localStorage on every change.
  // Logged-in users don't need this — Supabase is already the source
  // of truth for every mutation.
  useEffect(() => {
    if (!isAuthed) {
      writeGuestCart(items);
    }
  }, [items, isAuthed]);

  const add = useCallback(
    (item: Omit<CartItem, 'id'>) => {
      if (isAuthed) {
        // Optimistic insert so the UI feels instant, then reconcile the
        // temporary id with the real uuid Supabase assigns.
        const optimisticId = newLocalId();
        setItems((prev) => [...prev, { ...item, id: optimisticId }]);
        insertRemoteItem(item).then((saved) => {
          if (!saved) return;
          setItems((prev) => prev.map((i) => (i.id === optimisticId ? saved : i)));
        });
      } else {
        setItems((prev) => [...prev, { ...item, id: newLocalId() }]);
      }
    },
    [isAuthed]
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (isAuthed) {
        void deleteRemoteItem(id);
      }
    },
    [isAuthed]
  );

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      const safeQuantity = Math.max(1, quantity);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: safeQuantity } : i)));
      if (isAuthed) {
        void updateRemoteQuantity(id, safeQuantity);
      }
    },
    [isAuthed]
  );

  const clear = useCallback(() => {
    setItems([]);
    if (isAuthed) {
      void clearRemoteCart();
    }
  }, [isAuthed]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.amount * i.quantity, 0),
    [items]
  );

  const value: CartContextValue = {
    items,
    add,
    remove,
    updateQuantity,
    clear,
    isOpen,
    open,
    close,
    count,
    subtotal,
    syncing,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
