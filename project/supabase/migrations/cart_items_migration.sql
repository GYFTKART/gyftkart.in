-- ============================================================
-- GyftKart: cart_items table for cross-device cart sync
-- ============================================================

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  brand_slug text not null,
  brand_name text not null,
  brand_color text not null,
  brand_color2 text not null,
  category text not null,

  amount numeric not null,
  quantity integer not null default 1 check (quantity > 0),

  recipient_name text not null default '',
  recipient_email text not null default '',
  recipient_phone text not null default '',
  message text not null default '',
  occasion text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cart_items_user_id_idx on public.cart_items (user_id);
create index if not exists cart_items_created_at_idx on public.cart_items (created_at);

-- Keep updated_at fresh on every row update
create or replace function public.set_cart_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cart_items_updated_at on public.cart_items;
create trigger trg_cart_items_updated_at
before update on public.cart_items
for each row execute function public.set_cart_items_updated_at();

-- ============================================================
-- Row Level Security — each customer can only ever see/touch
-- their own cart rows.
-- ============================================================
alter table public.cart_items enable row level security;

create policy "Users can view their own cart items"
  on public.cart_items for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cart items"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own cart items"
  on public.cart_items for delete
  using (auth.uid() = user_id);
