import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_DAYS = 5;
const MAX_KEYS = 200;

interface Row {
    group_key: string;
    store: string;
    name: string;
    price: string;
    old_price: string | null;
    is_on_sale: boolean;
    url: string;
    image_url: string | null;
}

/**
 * POST { keys: string[] } -> kiekvienai prekių grupei pigiausias pasiūlymas kiekvienoje parduotuvėje.
 * Atsakymas: { offers: { [groupKey]: { [store]: { name, price, oldPrice?, isOnSale, url } } } }
 */
export async function POST(request: Request) {
    try {
        const body = (await request.json()) as { keys?: unknown };
        const keys = Array.isArray(body.keys)
            ? [...new Set(body.keys.filter((k): k is string => typeof k === "string"))].slice(0, MAX_KEYS)
            : [];
        if (keys.length === 0) return NextResponse.json({ offers: {} });

        const { rows } = await getPool().query<Row>(
            `select distinct on (group_key, store)
                    group_key, store, name, price, old_price, is_on_sale, url, image_url
               from public.store_products
              where group_key = any($1)
                and last_seen > now() - interval '${FRESH_DAYS} days'
              order by group_key, store, price asc`,
            [keys],
        );

        const offers: Record<string, Record<string, unknown>> = {};
        for (const r of rows) {
            (offers[r.group_key] ??= {})[r.store] = {
                name: r.name,
                price: Number(r.price),
                ...(r.old_price !== null && { oldPrice: Number(r.old_price) }),
                isOnSale: r.is_on_sale,
                url: r.url,
            };
        }
        return NextResponse.json({ offers });
    } catch (error) {
        console.error("Klaida skaičiuojant krepšelį:", error);
        return NextResponse.json({ error: "Nepavyko apskaičiuoti krepšelio" }, { status: 500 });
    }
}