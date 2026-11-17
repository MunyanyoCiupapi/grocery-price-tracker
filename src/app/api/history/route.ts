import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HistoryRow {
  date: string;
  store: string;
  price: string;
}
interface ProductRow {
  id: string;
  store: string;
  price: string;
}

/** Istorija yra konkrečios prekės konkrečioje parduotuvėje, ne sujungtos grupės vidurkis. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupKey = searchParams.get("groupKey") || "";
  if (!groupKey || groupKey.length > 300) {
    return NextResponse.json({ error: "Nenurodyta prekė" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const { rows: products } = await pool.query<ProductRow>(
      `select distinct on (store) id, store, price
         from public.store_products
        where group_key = $1 and last_seen > now() - interval '5 days'
        order by store, price asc`,
      [groupKey],
    );
    if (!products.length) return NextResponse.json({ history: [], current: [] });

    const ids = products.map((p) => p.id);
    const stores = new Map(products.map((p) => [p.id, p.store]));
    // price_history įrašai kuriami DB trigeriu, kai pasikeičia kaina.
    // Atsakymą ribojame iki 30 dienų ir daugiausia 1000 įrašų.
    const { rows } = await pool.query<{ product_id: string; price: string; recorded_at: string }>(
      `select product_id, price, recorded_at
         from public.price_history
        where product_id = any($1::text[])
          and recorded_at >= now() - interval '30 days'
        order by recorded_at asc
        limit 1000`,
      [ids],
    );

    const history: HistoryRow[] = rows.map((r) => ({
      date: r.recorded_at,
      store: stores.get(r.product_id) || "",
      price: Number(r.price).toFixed(2),
    }));
    return NextResponse.json({
      history,
      current: products.map((p) => ({ store: p.store, price: Number(p.price) })),
    });
  } catch (error) {
    console.error("Kainų istorijos klaida:", error);
    return NextResponse.json({ error: "Nepavyko gauti kainų istorijos" }, { status: 500 });
  }
}
