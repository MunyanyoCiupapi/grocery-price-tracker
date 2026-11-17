import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || key.length > 500) return NextResponse.json({ error: "Nenurodyta prekė" }, { status: 400 });
  try {
    const current = await getPool().query<{ store: string; price: string; last_seen: Date }>(
      `select distinct on (store) store, price, last_seen
       from public.store_products
       where group_key = $1 and last_seen > now() - interval '5 days'
       order by store, price asc, id asc`, [key],
    );
    const { rows } = await getPool().query<{ store: string; price: string; recorded_at: Date }>(
      `select p.store, h.price, h.recorded_at
       from public.price_history h join (
         select distinct on (store) id, store from public.store_products
         where group_key = $1 and last_seen > now() - interval '5 days'
         order by store, price asc, id asc
       ) p on p.id = h.product_id
       where h.recorded_at >= now() - interval '1 year'
       order by h.recorded_at asc`, [key],
    );
    return NextResponse.json({
      points: rows.map((row) => ({ store: row.store, price: Number(row.price), date: row.recorded_at })),
      current: current.rows.map((row) => ({ store: row.store, price: Number(row.price), date: row.last_seen })),
    });
  } catch (error) {
    console.error("Klaida skaitant kainų istoriją:", error);
    return NextResponse.json({ error: "Nepavyko gauti kainų istorijos" }, { status: 500 });
  }
}
