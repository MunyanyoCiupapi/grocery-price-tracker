import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import type { Product } from "../types/products";
import { makeGroupKey, normalizeSearchText } from "../lib/groupKey";

/**
 * Įkelia scraperių JSON failus (src/scrapers/data/**) į Postgres (Supabase).
 *
 *   npx tsx sync-db            – įkelia / atnaujina
 *   npx tsx sync-db --prune    – dar ištrina prekes, kurių šįkart nebebuvo
 *                                (tik toms parduotuvėms, kurių failai rasti)
 *
 * Kainų pasikeitimai automatiškai įrašomi į price_history (DB trigeris).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local ieškom projekto šaknyje (src/scrapers -> ../..)
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DATA_DIR = path.join(__dirname, "data");
const BATCH_SIZE = 500;
const PRUNE = process.argv.includes("--prune");

interface Row {
    id: string;
    store: string;
    name: string;
    nameSearch: string;
    groupKey: string;
    imageUrl: string | null;
    url: string;
    price: number;
    oldPrice: number | null;
    isOnSale: boolean;
    unit: string | null;
}

function listJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listJsonFiles(full));
        else if (entry.name.endsWith(".json")) out.push(full);
    }
    return out;
}

function loadRows(): Map<string, Row> {
    const rows = new Map<string, Row>();
    const files = listJsonFiles(DATA_DIR);

    for (const file of files) {
        let products: Product[];
        try {
            products = JSON.parse(fs.readFileSync(file, "utf-8"));
        } catch (e) {
            console.warn(`⚠️ Nepavyko perskaityti ${path.relative(DATA_DIR, file)}: ${(e as Error).message}`);
            continue;
        }
        if (!Array.isArray(products)) continue;

        for (const p of products) {
            const sp = p.prices?.[0];
            if (!p.id || !p.name || !sp || !sp.url || typeof sp.price !== "number" || sp.price <= 0) continue;

            rows.set(p.id, {
                id: p.id,
                store: sp.store,
                name: p.name.trim(),
                nameSearch: normalizeSearchText(p.name),
                groupKey: makeGroupKey(p.name, sp.measurementUnit),
                imageUrl: p.imageUrl ?? null,
                url: sp.url,
                price: sp.price,
                oldPrice: typeof sp.oldPrice === "number" ? sp.oldPrice : null,
                isOnSale: !!sp.isOnSale,
                unit: sp.measurementUnit ?? null,
            });
        }
    }

    console.log(`📂 Perskaityta failų: ${files.length}`);
    return rows;
}

async function upsertBatch(pool: Pool, batch: Row[]) {
    const values: unknown[] = [];
    const placeholders = batch.map((r, i) => {
        const o = i * 11;
        values.push(r.id, r.store, r.name, r.nameSearch, r.groupKey, r.imageUrl, r.url, r.price, r.oldPrice, r.isOnSale, r.unit);
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11})`;
    });

    await pool.query(
        `insert into public.store_products
            (id, store, name, name_search, group_key, image_url, url, price, old_price, is_on_sale, unit)
         values ${placeholders.join(",")}
         on conflict (id) do update set
            store = excluded.store,
            name = excluded.name,
            name_search = excluded.name_search,
            group_key = excluded.group_key,
            image_url = excluded.image_url,
            url = excluded.url,
            price = excluded.price,
            old_price = excluded.old_price,
            is_on_sale = excluded.is_on_sale,
            unit = excluded.unit,
            last_seen = now()`,
        values,
    );
}

(async () => {
    const startedAt = Date.now();

    if (!process.env.DATABASE_URL) {
        console.error("❌ Nerastas DATABASE_URL. Sukurk failą .env.local projekto šaknyje:\n   DATABASE_URL=postgresql://...");
        process.exit(1);
    }

    const rows = loadRows();
    if (rows.size === 0) {
        console.error("❌ Nerasta jokių produktų JSON failuose (src/scrapers/data).");
        process.exit(1);
    }

    const perStore = new Map<string, number>();
    for (const r of rows.values()) perStore.set(r.store, (perStore.get(r.store) ?? 0) + 1);
    console.log("📊 Pagal parduotuves:", Object.fromEntries(perStore));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3,
    });

    try {
        const runStart = (await pool.query<{ now: Date }>("select now()")).rows[0].now;

        const all = [...rows.values()];
        for (let i = 0; i < all.length; i += BATCH_SIZE) {
            await upsertBatch(pool, all.slice(i, i + BATCH_SIZE));
            process.stdout.write(`\r⬆️  Įkelta ${Math.min(i + BATCH_SIZE, all.length)} / ${all.length}`);
        }
        console.log("");

        if (PRUNE) {
            const stores = [...perStore.keys()];
            const res = await pool.query(
                "delete from public.store_products where store = any($1) and last_seen < $2",
                [stores, runStart],
            );
            console.log(`🧹 Ištrinta senų prekių: ${res.rowCount}`);
        }

        const stats = await pool.query<{ store: string; n: string }>(
            "select store, count(*) as n from public.store_products group by store order by store",
        );
        console.log("✅ DB dabar:", Object.fromEntries(stats.rows.map((r) => [r.store, Number(r.n)])));

        const groups = await pool.query<{ total: string; multi: string }>(
            `select count(*) as total, count(*) filter (where stores >= 2) as multi from (
                select group_key, count(distinct store) as stores
                from public.store_products group by group_key
             ) g`,
        );
        console.log(`🔗 Grupių: ${groups.rows[0].total}, iš jų parduodamos ≥2 parduotuvėse: ${groups.rows[0].multi}`);
    } finally {
        await pool.end();
    }

    console.log(`\n🎉 Baigta per ${Math.round((Date.now() - startedAt) / 1000)}s`);
})().catch((e) => {
    console.error("💥 Klaida:", e);
    process.exit(1);
});