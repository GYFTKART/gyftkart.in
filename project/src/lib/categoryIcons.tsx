import {
  ShoppingBag,
  Shirt,
  Sparkles,
  UtensilsCrossed,
  Plane,
  Clapperboard,
  type LucideIcon,
} from 'lucide-react';

const map: Record<string, LucideIcon> = {
  Shopping: ShoppingBag,
  Fashion: Shirt,
  Beauty: Sparkles,
  'Food & Dining': UtensilsCrossed,
  Travel: Plane,
  Entertainment: Clapperboard,
};

export function getCategoryIcon(category: string): LucideIcon {
  return map[category] ?? ShoppingBag;
}
