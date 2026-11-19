import { NextResponse } from "next/server";
import type { Product, StorePrices } from "@/types/products";
import { getPool } from "@/lib/db";
import { normalizeSearchText } from "@/lib/groupKey";
import { CATEGORY_OPTIONS } from "@/lib/sourceCategories";

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

type ProductWithKey = Product & { groupKey: string };

function toProduct(row: GroupRow): ProductWithKey {
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
        groupKey: row.group_key,
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

        const category = searchParams.get("category") || "";
        const terms = search.split(" ").filter(Boolean).slice(0, MAX_TERMS);

        const params: unknown[] = [];
        const where: string[] = [`last_seen > now() - interval '${FRESH_DAYS} days'`];

        const searchConditions: string[] = [];
        for (const term of terms) {
            params.push(`%${escapeLike(term)}%`);
            searchConditions.push(`name_search ilike $${params.length}`);
        }

        const having: string[] = [];
        // Ieškome pagal bent vienos parduotuvės pavadinimą, bet išlaikome visos grupės pasiūlymus.
        if (searchConditions.length) having.push(`bool_or(${searchConditions.join(" and ")})`);
        if (compareOnly) having.push("count(distinct store) >= 2");
        if (category === "kitos") {
            having.push("not bool_or(cardinality(category_codes) > 0)");
        } else if (category && CATEGORY_OPTIONS.some((option) => option.id === category)) {
            params.push(category);
            having.push(`bool_or($${params.length} = any(category_codes))`);
        }

        let startsWithSelect = "false";
        if (terms.length > 0) {
            params.push(`${escapeLike(terms[0])}%`);
            startsWithSelect = `bool_or(name_search like $${params.length})`;
        }

        params.push(limit, (page - 1) * limit);
        const limitIdx = params.length - 1;
        const offsetIdx = params.length;

        const sql = `
            with grouped as (
                select group_key, count(distinct store) as stores,
                       min(name_search) as sort_name, ${startsWithSelect} as starts_with
                from public.store_products
                where ${where.join(" and ")}
                group by group_key
                ${having.length ? `having ${having.join(" and ")}` : ""}
            ), selected as (
                select *, count(*) over() as total
                from grouped
                order by stores desc, starts_with desc, sort_name asc, group_key asc
                limit $${limitIdx} offset $${offsetIdx}
            )
            select selected.group_key, selected.total, selected.stores,
                (select json_agg(json_build_object(
                    'id', p.id, 'name', p.name, 'store', p.store, 'price', p.price,
                    'oldPrice', p.old_price, 'isOnSale', p.is_on_sale, 'unit', p.unit,
                    'url', p.url, 'imageUrl', p.image_url
                ) order by p.price asc)
                from public.store_products p
                where p.group_key = selected.group_key
                  and p.last_seen > now() - interval '${FRESH_DAYS} days') as items
            from selected
            order by selected.stores desc, selected.starts_with desc, selected.sort_name asc, selected.group_key asc
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
