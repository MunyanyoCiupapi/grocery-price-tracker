import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { clusterProducts } from "../lib/matcher";
import { extractSize } from "../lib/groupKey";

/**
 * Tik SKAITO duomenų bazę (nieko nekeičia) ir sukuria ataskaitą grupavimo kokybei įvertinti:
 *   A) Sujungimų pavyzdžiai su mažiausiu balu (galimi KLAIDINGI sujungimai)
 *   B) Poros, kurios NESUJUNGTOS, nors ženklas ir dydis tie patys (galimi PRARASTI sujungimai)
 *   C) Statistika
 *
 *   npx tsx src/scrapers/audit.ts
 *
 * Ataskaita: projekto šaknyje audit-report.txt. Atsiųsk man jos turinį – pagal tai taisysiu taisykles.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dir, "../../.env.local") });
dotenv.config({ path: path.resolve(dir, "../../.env") });

const FRESH_DAYS = 14;
const OUT = path.resolve(dir, "../../audit-report.txt");

function capsBrand(name: string): string {
    // pirmi du iš eilės DIDŽIOSIOMIS rašomi žodžiai (KINDER BUENO) – grubus ženklas ataskaitai
    const words = name.split(/[\s,]+/).filter((w) => w.length >= 2);
    const caps: string[] = [];
    for (const w of words) {
        const letters = w.replace(/[^A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]/g, "");
        if (letters.length >= 2 && letters === letters.toUpperCase()) caps.push(letters.toLowerCase());
        else if (caps.length) break;
    }
    return caps.slice(0, 2).join(" ");
}

(async () => {
    if (!process.env.DATABASE_URL) {
        console.error("❌ Nerastas DATABASE_URL (.env.local).");
        process.exit(1);
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
    try {
        const { rows } = await pool.query<{ id: string; store: string; name: string; unit: string | null; group_key: string }>(
            `select id, store, name, unit, group_key from public.store_products where last_seen > now() - interval '${FRESH_DAYS} days'`,
        );

        const res = clusterProducts(rows.map((r) => ({ id: r.id, store: r.store, name: r.name, unit: r.unit })));
        const out: string[] = [];

        // ---- C) statistika
        const groups = new Map<string, { store: string; name: string }[]>();
        for (const r of rows) {
            const k = res.keys.get(r.id)!;
            (groups.get(k) ?? groups.set(k, []).get(k)!).push({ store: r.store, name: r.name });
        }
        const multi = [...groups.values()].filter((g) => new Set(g.map((x) => x.store)).size >= 2).length;
        out.push(`STATISTIKA: prekių ${rows.length}, grupių ${groups.size}, grupių ≥2 parduotuvėse ${multi}, fuzzy sujungimų ${res.fuzzy.length}, praleistų blokų ${res.skippedBlocks}`);
        out.push("");

        // ---- A) mažiausio balo fuzzy sujungimai
        out.push("=== A) FUZZY SUJUNGIMAI (mažiausias balas pirma) – ar tikrai ta pati prekė? ===");
        for (const m of res.fuzzy.slice().sort((a, b) => a.score - b.score).slice(0, 120)) {
            out.push(`${m.score.toFixed(2)} | ${m.storeA}: ${m.a}  ⟷  ${m.storeB}: ${m.b}`);
        }
        out.push("");

        // ---- D) tos pačios parduotuvės skirtingi pavadinimai vienoje grupėje
        out.push("=== D) TA PATI PARDUOTUVĖ, skirtingi pavadinimai vienoje grupėje – ar tikrai ta pati prekė? ===");
        let dCount = 0;
        for (const g of groups.values()) {
            const byStore = new Map<string, Set<string>>();
            for (const x of g) (byStore.get(x.store) ?? byStore.set(x.store, new Set()).get(x.store)!).add(x.name);
            for (const [st, names] of byStore) {
                if (names.size < 2) continue;
                const list = [...names];
                out.push(`${st}: ${list[0]}  ⟷  ${list[1]}`);
                if (++dCount >= 100) break;
            }
            if (dCount >= 100) break;
        }
        out.push("");

        // ---- B) nesujungtos poros su tuo pačiu ženklu ir dydžiu
        out.push("=== B) NESUJUNGTA, nors ženklas ir dydis tie patys – ar tai ta pati prekė? ===");
        const buckets = new Map<string, { store: string; name: string; key: string }[]>();
        const seenName = new Set<string>();
        for (const r of rows) {
            const brand = capsBrand(r.name);
            const size = extractSize(r.name).size ?? (r.unit ? extractSize(r.unit).size : null);
            if (!brand || !size) continue;
            const dedupe = `${r.store}|${r.name}`;
            if (seenName.has(dedupe)) continue;
            seenName.add(dedupe);
            const b = `${brand}|${size.amount}${size.kind}`;
            (buckets.get(b) ?? buckets.set(b, []).get(b)!).push({ store: r.store, name: r.name, key: res.keys.get(r.id)! });
        }
        const pairs: string[] = [];
        for (const [b, list] of [...buckets.entries()].sort((x, y) => x[1].length - y[1].length)) {
            if (list.length > 30) continue; // per dideli blokai – vienodo ženklo ir dydžio daug skirtingų prekių
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i];
                    const c = list[j];
                    if (a.store === c.store || a.key === c.key) continue;
                    pairs.push(`[${b}] ${a.store}: ${a.name}  ≠  ${c.store}: ${c.name}`);
                }
            }
            if (pairs.length >= 400) break;
        }
        out.push(...pairs.slice(0, 400));
        out.push("");
        out.push(`(B dalyje pateikta ${Math.min(pairs.length, 400)} porų)`);

        fs.writeFileSync(OUT, out.join("\n"), "utf-8");
        console.log(`✅ Ataskaita: ${OUT}`);
        console.log(out[0]);
    } finally {
        await pool.end();
    }
})().catch((e) => {
    console.error("💥 Klaida:", e);
    process.exit(1);
});