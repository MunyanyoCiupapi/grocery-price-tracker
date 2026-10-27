import { NextResponse } from "next/server";
import type { Product, StorePrices } from "@/types/products";
import { getPool } from "@/lib/db";
import { normalizeSearchText } from "@/lib/groupKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_DAYS = 5;
const MAX_LIMIT = 100;
const MAX_TERMS = 6;

interface DbItem {
    id: string;
    name: string;
    store: StorePrices["store"];
    price: number;
    oldPrice: number | null;
    isOnSale: boolean;
    unit: string | null;
    url: string;
    imageUrl: string | null;
}

interface GroupRow {
    group_key: string;
    total: string;
    stores: string;
    items: DbItem[];
}

function escapeLike(term: string): string {
    return term.replace(/[\\%_]/g, (c) => "\\" + c);
}

function toProduct(row: GroupRow): Product {
    const seenStores = new Set<string>();
    const items = row.items.filter((it) => {
        if (seenStores.has(it.store)) return false;
        seenStores.add(it.store);
        return true;
    });
    const first = items[0];

    const prices: StorePrices[] = items.map((it) => ({
        store: it.store,
        price: Number(it.price),
        ...(it.oldPrice !== null && { oldPrice: Number(it.oldPrice) }),
        isOnSale: it.isOnSale,
        ...(it.unit && { measurementUnit: it.unit }),
        url: it.url,
    }));

    return {
        id: first.id,
        name: first.name,
        description: first.name,
        prices,
        imageUrl: items.find((it) => it.imageUrl)?.imageUrl ?? undefined,
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
        const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") || "24", 10) || 24));
        const search = normalizeSearchText((searchParams.get("q") || "").slice(0, 100));
        const compareOnly = searchParams.get("compare") === "1"; // tik prekės, parduodamos ≥2 parduotuvėse

        const terms = search.split(" ").filter(Boolean).slice(0, MAX_TERMS);

        const params: unknown[] = [];
        const where: string[] = [`last_seen > now() - interval '${FRESH_DAYS} days'`];

        for (const term of terms) {
            params.push(`%${escapeLike(term)}%`);
            where.push(`name_search ilike $${params.length}`);
        }

        // rūšiavimas: pirmiausia prekės, esančios daugiau parduotuvių, tada tos, kurios prasideda ieškomu žodžiu
        let startsWithOrder = "";
        if (terms.length > 0) {
            params.push(`${escapeLike(terms[0])}%`);
            startsWithOrder = `bool_or(name_search like $${params.length}) desc, `;
        }

        params.push(limit, (page - 1) * limit);
        const limitIdx = params.length - 1;
        const offsetIdx = params.length;

        const sql = `
            select
                group_key,
                count(*) over() as total,
                count(distinct store) as stores,
                json_agg(json_build_object(
                    'id', id, 'name', name, 'store', store, 'price', price,
                    'oldPrice', old_price, 'isOnSale', is_on_sale, 'unit', unit,
                    'url', url, 'imageUrl', image_url
                ) order by price asc) as items
            from public.store_products
            where ${where.join(" and ")}
            group by group_key
            ${compareOnly ? "having count(distinct store) >= 2" : ""}
            order by count(distinct store) desc, ${startsWithOrder}min(name_search) asc, group_key asc
            limit $${limitIdx} offset $${offsetIdx}
        `;

        const { rows } = await getPool().query<GroupRow>(sql, params);

        const total = rows.length > 0 ? Number(rows[0].total) : 0;
        const totalPages = Math.ceil(total / limit);

        return NextResponse.json(
            {
                products: rows.map(toProduct),
                pagination: { total, page, totalPages, limit },
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Klaida skaitant prekių duomenis:", error);
        return NextResponse.json({ error: "Nepavyko užkrauti produktų" }, { status: 500 });
    }
}