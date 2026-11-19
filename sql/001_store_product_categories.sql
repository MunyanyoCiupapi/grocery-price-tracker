-- Vieną prekę parduotuvė gali rodyti keliose kategorijose.
alter table public.store_products
    add column if not exists category_codes text[] not null default '{}',
    add column if not exists source_category_id text;

