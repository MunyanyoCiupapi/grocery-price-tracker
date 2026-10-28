import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { clusterProducts } from "../lib/matcher";

/**
 * Perskaičiuoja group_key visoms šviežioms prekėms, sujungdamas panašiai
 * pavadintas to paties produkto prekes iš skirtingų parduotuvių.
 *
 *   npm run rematch            – perskaičiuoja
 *   npm run rematch -- --show  – dar atspausdina sujungtų porų pavyzdžius (peržiūrai)
 *
 * Kviečiamas ir automatiškai po `npm run sync`.
 */

const FRESH_DAYS = 14;
const BATCH = 1000;

export async function rematchAll(pool: Pool, opts: { show?: boolean } = {}) {
    const { rows } = await pool.query<{ id: string; store: string; name: string; unit: string | null; group_key: string }>(
        `select id, store, name, unit, group_key from public.store_products
         where last_seen > now() - interval '${FRESH_DAYS} days'`,
    );

    // 1) iš naujo paskaičiuojam raktus nuo nulio (tikslus raktas + fuzzy sujungimas)
    const result = clusterProducts(rows.map((r) => ({ id: r.id, store: r.store, name: r.name, unit: r.unit })));

    const changed: [string, string][] = [];
    for (const r of rows) {
        const gk = result.keys.get(r.id);
        if (gk && gk !== r.group_key) changed.push([r.id, gk]);
    }

    for (let i = 0; i < changed.length; i += BATCH) {
        const part = changed.slice(i, i + BATCH);
        const values: string[] = [];
        const params: string[] = [];
        part.forEach(([id, gk], j) => {
            values.push(`($${j * 2 + 1}, $${j * 2 + 2})`);
            params.push(id, gk);
        });
        await pool.query(
            `update public.store_products p set group_key = v.gk
             from (values ${values.join(",")}) as v(id, gk)
             where p.id = v.id`,
            params,
        );
    }

    console.log(
        `🧩 Suderinimas: peržiūrėta ${rows.length}, fuzzy sujungimų ${result.fuzzy.length}, pakeista raktų ${changed.length}` +
            (result.skippedBlocks ? `, praleista per didelių blokų ${result.skippedBlocks}` : ""),
    );

    if (opts.show) {
        for (const m of result.fuzzy.slice().sort((x, y) => x.score - y.score).slice(0, 200)) {
            console.log(`  ${m.score.toFixed(2)} | ${m.storeA}: ${m.a}  ⟷  ${m.storeB}: ${m.b}`);
        }
    }
    return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    dotenv.config({ path: path.resolve(dir, "../../.env.local") });
    dotenv.config({ path: path.resolve(dir, "../../.env") });

    if (!process.env.DATABASE_URL) {
        console.error("❌ Nerastas DATABASE_URL (.env.local).");
        process.exit(1);
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
    rematchAll(pool, { show: process.argv.includes("--show") })
        .catch((e) => {
            console.error("💥 Klaida:", e);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}