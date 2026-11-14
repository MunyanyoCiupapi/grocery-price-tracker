import { extractSize, makeGroupKey, normalizeSearchText } from "./groupKey";

/**
 * Prekių suporavimas tarp parduotuvių (neapibrėžtas / "fuzzy" jungimas).
 *
 * Problema: ta pati prekė parduotuvėse užrašoma skirtingai:
 *   Rimi:   Vaflinis batonėlis KINDER BUENO, 43g
 *   IKI:    Šokoladinis batonėlis KINDER BUENO, 43 g
 *   Maxima: Vaflinis batonėlis KINDER BUENO su šokoladu, 43 g
 *
 * Kaip sprendžiam:
 *  1. Pirmiausia sujungiam prekes su identišku raktu (makeGroupKey) – kaip anksčiau.
 *  2. Tada ieškom panašių poros TIK jei sutampa:
 *        - prekės ženklas (parduotuvės jį rašo DIDŽIOSIOMIS: "KINDER BUENO"),
 *        - tikslus dydis (43 g),
 *     ir dar bent dalis likusių žodžių (batonėlis, vaflinis...).
 *  3. Apsaugos nuo klaidingo sujungimo:
 *        - tos pačios parduotuvės dvi prekės vienoje grupėje lieka tik jei jos labai panašios
 *          (kai kurios parduotuvės tą pačią prekę turi du kartus; svetainė rodo pigiausią),
 *        - skirtingi riebumo % ar skaičiai ("2.5%" vs "3.2%") neleidžia jungti,
 *        - variantų žodžiai (white / dark / zero / baltas / juodas...) turi sutapti.
 *  4. Poros jungiamos nuo geriausio balo žemyn, tad tikros poros turi pirmenybę.
 *
 * Prekės be didžiosiomis rašomo prekės ženklo ar be dydžio jungiamos tik pagal identišką raktą.
 */

export interface MatchInput {
    id: string;
    store: string;
    name: string;
    unit?: string | null;
}

export interface FuzzyMerge {
    a: string; // pavadinimas
    b: string;
    storeA: string;
    storeB: string;
    score: number;
}

export interface MatchResult {
    /** prekės id -> galutinis group_key */
    keys: Map<string, string>;
    /** kurios poros buvo sujungtos fuzzy būdu (peržiūrai) */
    fuzzy: FuzzyMerge[];
    skippedBlocks: number;
}

const MIN_SCORE = 0.3;
const STRONG_BRAND_SCORE = 0.4; // stiprus ženklas + dydis, bet aprašomieji žodžiai skiriasi
const SAME_STORE_MIN_SCORE = 0.99; // tos pačios parduotuvės dvi prekės tiesiogiai jungiamos tik jei pavadinimai praktiškai tapatūs
const CLUSTER_OVERLAP_MIN_SCORE = 0.65; // grupės su ta pačia parduotuve jungiamos per kitų parduotuvių prekes, jei jos labai panašios
const MAX_BLOCK_SIZE = 400;

const GENERIC_CAPS = new Set([
    "UHT", "BIO", "EKO", "XL", "XXL", "XS", "PET", "LED", "USB", "SPF", "TV", "GMO",
    "MSC", "ASC", "BBQ", "UV", "DVD", "WC", "KG", "ML", "VNT", "NEW",
]);

// prekės tipo žodžių stem'ai: jei abi pusės turi tipą ir jie skirtingi – tai skirtingos prekės
const TYPE_STEMS = new Set([
    "samp", "kond", "krem", "vand", "kauk", "zele", "past", "laka", "seru", "dezo", "muil", "puto",
]);

// žodžiai, kurie neturi įtakos, ar tai ta pati prekė
const FILLER = new Set(["su", "ir", "bei", "is", "del", "skonio", "skoniu"]);

// jei toks žodis yra tik vienoje pusėje – tai skirtingos prekės (jau po stem'inimo)
const VARIANT_STEMS = new Set([
    "whit", "dark", "blac", "zero", "ligh", "lite", "clas", "orig",
    "neal", // nealkoholinis / nealk.
    "ekol", // ekologiškas / ekol.
    "asht", "aitr", // aštrus / aštr. / aitrus
    "ruky", // rūkytas
    "mini", // MINI
]);

// tarpusavyje nesuderinami žodžiai: jei viena pusė turi vieną, o kita kitą – tai skirtingos prekės
// (baltasis / raudonasis / rožinis vynas, pieninis / juodasis šokoladas, žaliosios / juodosios alyvuogės)
const EXCLUSIVE_STEMS = new Set(["balt", "raud", "rozi", "zali", "juod", "pien"]);
const normExclusive = (t: string) => (t === "raus" ? "rozi" : t); // rausvasis = rožinis

/** primityvus lietuvių k. stem'as: žodžiai nuo 5 raidžių sutrumpinami iki 4 (sūriu/sūrio -> suri) */
function stem(word: string): string {
    return word.length >= 5 ? word.slice(0, 4) : word;
}

interface Parsed {
    key: string;
    sizeKey: string;
    sizeKeys: Set<string>; // visi pavadinime rasti dydžiai ("90 ml / 62 g" -> 90ml, 62g)
    brand: string[]; // stem'ai
    brandSet: Set<string>;
    all: Set<string>; // visi žodžių stem'ai (įskaitant prekės ženklą), be pct ir skaičių
    rest: Set<string>; // stem'ai be prekės ženklo, be pct ir skaičių
    pct: Set<string>;
    nums: Set<string>;
    words: Set<string>; // pilni (nestem'inti) žodžiai
    quals: Set<string>; // "su druska" / "be cukraus" tipo priedai: "su:drus", "be:cuk"
}

/** Prekės ženklas = žodžiai, parašyti DIDŽIOSIOMIS (jei ne visas pavadinimas didžiosiomis). */
function extractBrandTokens(rawName: string): string[] {
    // "V.S.O.P" -> "VSOP", "J.P.CHENET" -> "JP.CHENET" (taškai tarp pavienių raidžių)
    const name = rawName.replace(/(?<=\b\p{L})\.(?=\p{L}\b)/gu, "");
    const words = name.split(/[\s,;()/]+/).filter(Boolean);
    const letterWords = words.filter((w) => /\p{L}/u.test(w));
    if (letterWords.length === 0) return [];

    const isCaps = (w: string) => /\p{L}/u.test(w) && !/\d/.test(w) && w === w.toUpperCase() && w !== w.toLowerCase() && w.length >= 2;

    const caps = letterWords.filter(isCaps);
    const meaningful = letterWords.filter((w) => w.length >= 2);
    // visas (ar beveik visas) pavadinimas didžiosiomis -> prekės ženklo atskirti negalim
    if (caps.length === 0 || caps.length >= meaningful.length || caps.length >= Math.max(3, Math.ceil(meaningful.length * 0.7))) return [];

    const tokens: string[] = [];
    for (const w of caps) {
        if (GENERIC_CAPS.has(w)) continue;
        for (const t of normalizeSearchText(w).split(" ")) {
            if (t.length > 1) tokens.push(stem(t));
        }
    }
    return [...new Set(tokens)];
}

function parse(name: string, unit?: string | null): Parsed {
    const key = makeGroupKey(name, unit ?? undefined);
    const sep = key.lastIndexOf("|");
    const sizeKey = key.slice(sep + 1);
    const tokens = key.slice(0, sep).split(" ").filter(Boolean);

    // visi dydžiai pavadinime (ir vienete): "90 ml / 62 g" -> {90ml, 62g}
    const sizeKeys = new Set<string>();
    const sizeAmounts = new Set<number>();
    const addSize = (sz: { amount: number; kind: string } | null) => {
        if (!sz) return;
        sizeAmounts.add(sz.amount);
        sizeKeys.add(`${sz.amount}${sz.kind}`);
    };
    let sizeText = name;
    for (let n = 0; n < 3; n++) {
        const r = extractSize(sizeText);
        if (!r.size) break;
        addSize(r.size);
        sizeText = r.rest;
    }
    if (unit) addSize(extractSize(unit).size);
    if (sizeKey) sizeKeys.add(sizeKey);
    const brand = extractBrandTokens(name);
    const brandSet = new Set(brand);

    const rest = new Set<string>();
    const all = new Set<string>();
    const pct = new Set<string>();
    const nums = new Set<string>();

    for (const t of tokens) {
        if (t.endsWith("pct")) {
            pct.add(t);
        } else if (/^dydis[a-z]{1,3}$/.test(t)) {
            nums.add(t); // "dydis: L" / "dydis: XL" – skirtingi dydžiai, stem'inimas jų nesuvienodintų
        } else if (/\d/.test(t)) {
            // dydis, parašytas du kartus ("0,7 l, 700 ml"), nėra produkto skiriamasis skaičius
            const num = Number(t);
            if (sizeAmounts.has(num) || sizeAmounts.has(num * 1000)) continue;
            nums.add(t);
        } else {
            const s = stem(t);
            if (!FILLER.has(t)) all.add(s);
            if (!brandSet.has(s) && !FILLER.has(t)) rest.add(s);
        }
    }

    // priedai po "su" / "be" ("su medumi ir druska", "be cukraus") – dažniausiai skonis ar sudėtis, t. y. skiriamasis požymis
    const quals = new Set<string>();
    const plain = normalizeSearchText(name.replace(/[,;()/]/g, " , "));
    for (const m of plain.matchAll(/\b(su|be)\s+([a-z0-9 ]+?)(?=\s,|$)/g)) {
        for (const w of m[2].split(" ")) {
            if (w.length < 3 || FILLER.has(w) || w === "rieb") continue;
            quals.add(`${m[1]}:${stem(w)}`);
        }
    }

    const words = new Set(tokens.filter((t) => !/\d/.test(t)));
    return { key, sizeKey, sizeKeys, brand, brandSet, all, rest, pct, nums, quals, words };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

function isSubset(small: Iterable<string>, large: Set<string>): boolean {
    for (const x of small) if (!large.has(x)) return false;
    return true;
}

/**
 * Prekės ženklas sutampa, jei:
 *  - abu turi (didžiosiomis rašytą) ženklą ir jie vienodi, arba
 *  - vienas ženklo nerašo didžiosiomis ("Coca-Cola"), bet to ženklo žodžiai yra jo pavadinime.
 */
/** Ženklo žodis kitoje pusėje turi būti tas pats pilnas žodis, ne tik tie patys 4 pirmi simboliai ("KARALIŠKAS" ≠ "karamelizuoti"). */
function brandWordsPresent(withBrand: Parsed, other: Parsed): boolean {
    for (const w of withBrand.words) {
        if (!withBrand.brandSet.has(stem(w))) continue;
        const n = Math.min(w.length, 5);
        let found = false;
        for (const o of other.words) {
            if (o.length >= Math.min(n, 4) && o.slice(0, n) === w.slice(0, n)) { found = true; break; }
            if (w.startsWith(o) && o.length >= 3) { found = true; break; }
        }
        if (!found) return false;
    }
    return true;
}

function brandMatches(a: Parsed, b: Parsed): boolean {
    if (a.brand.length > 0 && b.brand.length > 0) {
        // vienodi ženklai, arba trumpesnis (≥2 žodžių) yra ilgesnio dalis: "LAVAZZA GRAN CREMA" ~ "LAVAZZA GRAN CREMA ESPRESSO".
        // Vieno žodžio ženklas + papildomi didžiosios žodžiai = kitas produktas: "JAMESON" ≠ "JAMESON BLACK BARREL".
        if (a.brand.length === b.brand.length) return isSubset(a.brand, b.brandSet);
        const [small, large] = a.brand.length < b.brand.length ? [a, b] : [b, a];
        if (small.brand.length >= 2 && isSubset(small.brand, large.brandSet)) return true;
        // vienoje parduotuvėje "All IN 1 EXTRA" didžiosiomis, kitoje mažosiomis: papildomi "ženklo" žodžiai
        // yra kitos pusės pavadinime – tai tik skirtinga rašyba, o ne kitas produktas
        return isSubset(small.brand, large.brandSet) && large.brand.every((t) => small.brandSet.has(t) || small.all.has(t));
    }
    if (a.brand.length > 0) return isSubset(a.brand, b.all) && brandWordsPresent(a, b);
    if (b.brand.length > 0) return isSubset(b.brand, a.all) && brandWordsPresent(b, a);
    return false;
}

/** 0 = nesutampa, kitaip balas (0..1). */
function stemCompat(t: string, u: string): boolean {
    if (t === u) return true;
    const [tm, tw = ""] = t.split(":");
    const [um, uw = ""] = u.split(":");
    return tm === um && Math.min(tw.length, uw.length) >= 3 && (tw.startsWith(uw) || uw.startsWith(tw));
}

/** "su X" priedai: jei abi pusės turi ir jie visai nesutampa – skirtingi skoniai; tos pačios parduotuvės prekėms priedai turi sutapti. */
function qualsOk(a: Parsed, b: Parsed, sameStore: boolean): boolean {
    if (a.quals.size === 0 && b.quals.size === 0) return true;
    if (a.quals.size === 0 || b.quals.size === 0) return true;
    if (sameStore) {
        const eachMatched = (x: Set<string>, y: Set<string>) => [...x].every((t) => [...y].some((u) => stemCompat(t, u)));
        return eachMatched(a.quals, b.quals) && eachMatched(b.quals, a.quals);
    }
    return [...a.quals].some((t) => [...b.quals].some((u) => stemCompat(t, u)));
}

function sameBrand(a: Parsed, b: Parsed): boolean {
    return a.brand.length === b.brand.length && isSubset(a.brand, b.brandSet);
}

function matchScore(a: Parsed, b: Parsed, sameStore = false): number {
    let sizeOk = false;
    for (const k of a.sizeKeys) if (b.sizeKeys.has(k)) { sizeOk = true; break; }
    if (!sizeOk) return 0;

    // to paties tipo dydžiai (g / ml), kai abi pusės juos turi, turi sutapti ("160 l" vs "140 l" – skirtingos prekės)
    for (const kind of ["g", "ml"]) {
        const ka = [...a.sizeKeys].filter((k) => k.endsWith(kind) && !k.endsWith("pcs"));
        const kb = [...b.sizeKeys].filter((k) => k.endsWith(kind) && !k.endsWith("pcs"));
        if (ka.length > 0 && kb.length > 0 && !ka.some((k) => kb.includes(k))) return 0;
    }

    // skirtingi vienetų skaičiai (40 vnt. vs 72 vnt.) – skirtingi pakuotės dydžiai, net jei kitas dydis (kg intervalas) sutampa
    const pcsA = [...a.sizeKeys].filter((k) => k.endsWith("pcs"));
    const pcsB = [...b.sizeKeys].filter((k) => k.endsWith("pcs"));
    if (pcsA.length > 0 && pcsB.length > 0 && !pcsA.some((k) => pcsB.includes(k))) return 0;
    if (!brandMatches(a, b)) return 0;
    if (!qualsOk(a, b, sameStore)) return 0;

    // skirtingi riebumo % arba skaičiai -> skirtingos prekės
    if (a.pct.size > 0 && b.pct.size > 0 && !setsEqual(a.pct, b.pct)) return 0;
    // skaičius tik vienoje pusėje (pvz. "12 YEARS" vs paprastas viskis) – tai skirtingi produktai
    if ((a.nums.size > 0 || b.nums.size > 0) && !setsEqual(a.nums, b.nums)) return 0;

    // likę žodžiai be (abiejų) prekės ženklo žodžių
    const restA = new Set([...a.rest].filter((t) => !b.brandSet.has(t)));
    const restB = new Set([...b.rest].filter((t) => !a.brandSet.has(t)));

    // variantų žodis tik vienoje pusėje (white / dark / zero / nealk. ...) – tikrinam visus žodžius, ir ženklo
    for (const v of VARIANT_STEMS) {
        if (a.all.has(v) !== b.all.has(v)) return 0;
    }

    const exA = [...restA].map(normExclusive).filter((t) => EXCLUSIVE_STEMS.has(t));
    const exB = [...restB].map(normExclusive).filter((t) => EXCLUSIVE_STEMS.has(t));
    if (exA.length > 0 && exB.length > 0 && !exA.some((t) => exB.includes(t))) return 0;

    // skirtingi prekės tipai su tuo pačiu ženklu (šampūnas vs kondicionierius, kremas vs micelinis vanduo) – skirtingos prekės
    const typesA = [...restA].filter((t) => TYPE_STEMS.has(t));
    const typesB = [...restB].filter((t) => TYPE_STEMS.has(t));
    if (typesA.length > 0 && typesB.length > 0 && !typesA.some((t) => typesB.includes(t))) return 0;

    // identiškas, bent 3 žodžių ženklas/linija ("DOVE FRUITY NOURISH", "COLGATE ADVANCE WHITE PURPLE") + tas pats dydis:
    // aprašomieji žodžiai (želė / gelis, skutimosi / skustuvo) nebeturi lemiamos reikšmės
    const strongBrand = a.brand.length >= 3 && a.brand.length === b.brand.length;

    // vienoje pusėje papildomų žodžių nėra – prekės ženklas + dydis jau gana tikslus
    if (restA.size === 0 && restB.size === 0) return 1;
    if (restA.size === 0 || restB.size === 0) return 0.5;

    // žodžių sutapimas; sutrumpinimai laikomi tuo pačiu žodžiu ("mar." ~ "marinuoti", "sk." ~ "skystasis")
    const used = new Set<string>();
    let shared = 0;
    for (const t of restA) {
        for (const u of restB) {
            if (used.has(u)) continue;
            if (t === u || (Math.min(t.length, u.length) >= 3 && (t.startsWith(u) || u.startsWith(t)))) {
                used.add(u);
                shared++;
                break;
            }
        }
    }
    if (shared === 0) return strongBrand ? STRONG_BRAND_SCORE : 0;

    const unmatchedA = restA.size - shared;
    const unmatchedB = restB.size - shared;
    const jaccard = shared / (restA.size + restB.size - shared);

    // abiejose pusėse yra "svetimų" žodžių (pvz. skirtingi skoniai: agrastų / vyšnių) – jungiam tik jei labai panašu
    // tos pačios parduotuvės dvi prekės: jungiam tik kai viena pavadinimo žodžių aibė yra kitos dalis
    if (sameStore && unmatchedA > 0 && unmatchedB > 0) return 0;
    if (unmatchedA > 0 && unmatchedB > 0 && jaccard <= 0.5) return strongBrand ? STRONG_BRAND_SCORE : 0;

    if (jaccard >= MIN_SCORE) return jaccard;
    return strongBrand ? STRONG_BRAND_SCORE : 0;
}

interface Node {
    key: string;
    name: string;
    store: string; // pirmos eilutės parduotuvė (peržiūrai)
    stores: Set<string>;
    parsed: Parsed;
}

export function clusterProducts(inputs: MatchInput[]): MatchResult {
    // 1) mazgai pagal tikslų raktą
    const nodeByKey = new Map<string, Node>();
    const rowKey = new Map<string, string>();

    for (const row of inputs) {
        const parsed = parse(row.name, row.unit);
        rowKey.set(row.id, parsed.key);

        const existing = nodeByKey.get(parsed.key);
        if (existing) {
            existing.stores.add(row.store);
        } else {
            nodeByKey.set(parsed.key, {
                key: parsed.key,
                name: row.name,
                store: row.store,
                stores: new Set([row.store]),
                parsed,
            });
        }
    }

    const nodes = [...nodeByKey.values()];
    const index = new Map<string, number>(nodes.map((n, i) => [n.key, i]));

    // 2) union-find
    const parent = nodes.map((_, i) => i);
    const clusterStores = nodes.map((n) => new Set(n.stores));
    const clusterMembers: number[][] = nodes.map((_, i) => [i]);
    // klasterio riebumo/stiprumo % reikšmės: klasteryje negali atsirasti dvi skirtingos (apsauga nuo sujungimo per prekę be %)
    const clusterPct = nodes.map((n) => new Set(n.parsed.pct));
    const find = (x: number): number => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };

    // 3) kandidatai: blokai pagal dydį + prekės ženklo žodį
    const blocks = new Map<string, number[]>();
    const addToBlock = (k: string, i: number) => {
        const list = blocks.get(k);
        if (list) list.push(i);
        else blocks.set(k, [i]);
    };

    nodes.forEach((n, i) => {
        for (const sk of n.parsed.sizeKeys) for (const b of n.parsed.brand) addToBlock(`${sk}|${b}`, i);
    });

    // prekės be didžiosiomis rašyto ženklo ("Coca-Cola") patenka į blokus tų ženklų, kuriuos jų pavadinime jau žinom
    nodes.forEach((n, i) => {
        if (n.parsed.brand.length > 0) return;
        for (const sk of n.parsed.sizeKeys) {
            for (const t of n.parsed.all) {
                const k = `${sk}|${t}`;
                if (blocks.has(k)) addToBlock(k, i);
            }
        }
    });

    const candidates: { a: number; b: number; score: number }[] = [];
    const seenPairs = new Set<string>();
    let skippedBlocks = 0;

    for (const list of blocks.values()) {
        if (list.length < 2) continue;
        if (list.length > MAX_BLOCK_SIZE) {
            skippedBlocks++;
            continue;
        }
        for (let x = 0; x < list.length; x++) {
            for (let y = x + 1; y < list.length; y++) {
                const a = list[x];
                const b = list[y];
                const pairKey = a < b ? `${a}-${b}` : `${b}-${a}`;
                if (seenPairs.has(pairKey)) continue;
                seenPairs.add(pairKey);

                let overlap = false;
                for (const s of nodes[a].stores) if (nodes[b].stores.has(s)) { overlap = true; break; }

                const score = matchScore(nodes[a].parsed, nodes[b].parsed, overlap);
                if (score <= 0) continue;

                // tos pačios parduotuvės prekės jungiamos tik jei labai panašios
                if (overlap) {
                    // du vienos parduotuvės įrašai tiesiogiai jungiami tik jei beveik tapatūs;
                    // jei bent vienas jau yra kelių parduotuvių grupėje – žemesnis slenkstis (chain check dar patikrins)
                    const multi = nodes[a].stores.size > 1 || nodes[b].stores.size > 1;
                    const min = multi ? CLUSTER_OVERLAP_MIN_SCORE : SAME_STORE_MIN_SCORE;
                    if (score < min || !sameBrand(nodes[a].parsed, nodes[b].parsed)) continue;
                }

                candidates.push({ a, b, score });
            }
        }
    }

    // 4) jungiam nuo geriausio balo, saugodami "viena prekė per parduotuvę"
    candidates.sort((p, q) => q.score - p.score || nodes[p.a].key.localeCompare(nodes[q.a].key));

    const fuzzy: FuzzyMerge[] = [];

    for (const c of candidates) {
        const ra = find(c.a);
        const rb = find(c.b);
        if (ra === rb) continue;

        let overlap = false;
        for (const s of clusterStores[ra]) if (clusterStores[rb].has(s)) { overlap = true; break; }
        if (overlap && c.score < CLUSTER_OVERLAP_MIN_SCORE) continue;

        // grandininis jungimas: kiekviena tos pačios parduotuvės prekių pora abiejuose klasteriuose turi būti tikrai panaši
        if (overlap) {
            let ok = true;
            outer: for (const x of clusterMembers[ra]) {
                for (const y of clusterMembers[rb]) {
                    let shares = false;
                    for (const st of nodes[x].stores) if (nodes[y].stores.has(st)) { shares = true; break; }
                    if (!shares) continue;
                    if (!sameBrand(nodes[x].parsed, nodes[y].parsed) || matchScore(nodes[x].parsed, nodes[y].parsed, true) < CLUSTER_OVERLAP_MIN_SCORE) {
                        ok = false;
                        break outer;
                    }
                }
            }
            if (!ok) continue;
        }

        const pctUnion = new Set([...clusterPct[ra], ...clusterPct[rb]]);
        if (pctUnion.size > 1) continue;

        parent[rb] = ra;
        clusterMembers[ra].push(...clusterMembers[rb]);
        clusterPct[ra] = pctUnion;
        for (const s of clusterStores[rb]) clusterStores[ra].add(s);

        fuzzy.push({
            a: nodes[c.a].name,
            b: nodes[c.b].name,
            storeA: nodes[c.a].store,
            storeB: nodes[c.b].store,
            score: Math.round(c.score * 100) / 100,
        });
    }

    // 5) galutinis raktas = mažiausias (abėcėlės tvarka) klasterio mazgo raktas
    const canonical = new Map<number, string>();
    nodes.forEach((n, i) => {
        const r = find(i);
        const cur = canonical.get(r);
        if (cur === undefined || n.key < cur) canonical.set(r, n.key);
    });

    const keys = new Map<string, string>();
    for (const row of inputs) {
        const nodeIdx = index.get(rowKey.get(row.id)!)!;
        keys.set(row.id, canonical.get(find(nodeIdx))!);
    }

    return { keys, fuzzy, skippedBlocks };
}