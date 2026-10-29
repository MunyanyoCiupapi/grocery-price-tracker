/**
 * Prekių pavadinimų normalizavimas ir "group_key" – raktas, pagal kurį
 * sujungiame tą pačią prekę iš skirtingų parduotuvių.
 *
 * Idėja: pavadinimas -> žodžiai (be diakritikų, be triukšmo, surikiuoti)
 *        + dydis (g / ml / vnt, suvestas į vienodus vienetus).
 *
 *   "Pienas ŽEMAITIJOS, 2,5% rieb., 1 l"   -> "2.5pct pienas zemaitijos|1000ml"
 *   "Žemaitijos pienas 2.5% 1l"            -> "2.5pct pienas zemaitijos|1000ml"
 *
 * Tai euristika, o ne tikslus suderinimas: skirtingai užrašyti pavadinimai
 * (pvz. su sutrumpinimais) gali nesusijungti. Kai keisi šią logiką, tiesiog
 * paleisk sync-db iš naujo – group_key perskaičiuojamas.
 */

export type SizeKind = "g" | "ml" | "pcs";

export interface ParsedSize {
    amount: number;
    kind: SizeKind;
}

const STOPWORDS = new Set([
    "rieb", "riebumo", "riebus", "riebi", "vnt", "vienetai", "pak", "pakuote",
    "kilmes", "salis", "lietuva", "lietuvos", "lenkija", "ispanija", "italija",
    "olandija", "belgija", "estija", "latvija", "kg", "g", "ml", "l", "cl",
]);

/**
 * Žinomi to paties produkto pavadinimų variantai (rašyk be diakritikų, mažosiomis).
 * Pridėk čia naujų, kai pastebėsi, kad ta pati prekė skirtingose parduotuvėse nesusijungia.
 */
const ALIASES: [RegExp, string][] = [
    // "su baltuoju šokoladu" = "WHITE" (Kinder Bueno ir pan.)
    [/\bbalt\w*\s+sokolad\w*/g, "white"],
    [/\bmonster\s+ultra\s+white\b/g, "monster zero ultra"],
    [/\bmonster\s+white\s+ultra\b/g, "monster zero ultra"],
    [/\bgelis\b/g, "zele"], // dušo gelis = dušo želė
];

function applyAliases(text: string): string {
    let value = stripDiacritics(text);
    for (const [pattern, replacement] of ALIASES) value = value.replace(pattern, replacement);
    return value;
}

/** mažosios raidės, be lietuviškų (ir kitų) diakritikų */
export function stripDiacritics(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ł/g, "l")
        .replace(/đ/g, "d")
        .replace(/ß/g, "ss")
        .replace(/['’`´]/g, "") // L'OR -> LOR, LAY'S -> LAYS, BALLANTINE`S -> BALLANTINES
        .toLowerCase();
}

/** Tekstas, kuris saugomas name_search stulpelyje ir naudojamas paieškai. */
export function normalizeSearchText(text: string): string {
    return stripDiacritics(text)
        .replace(/[^a-z0-9%]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function toNumber(raw: string): number {
    return parseFloat(raw.replace(",", "."));
}

const MULTIPACK_RE = /(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)(?![a-z])/i;
const MULTIPACK_REV_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\s*[x×*]\s*(\d+)(?![a-z0-9])/i;
const SINGLE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)(?![a-z])/i;
const PCS_RE = /(\d+)\s*(?:vnt|vienet\w*)(?![a-z])/i;

function toSize(amount: number, unit: string): ParsedSize {
    switch (unit.toLowerCase()) {
        case "kg": return { amount: Math.round(amount * 1000), kind: "g" };
        case "g":  return { amount: Math.round(amount), kind: "g" };
        case "l":  return { amount: Math.round(amount * 1000), kind: "ml" };
        case "cl": return { amount: Math.round(amount * 10), kind: "ml" };
        default:   return { amount: Math.round(amount), kind: "ml" };
    }
}

/** Randa dydį tekste ir grąžina jį kartu su tekstu, iš kurio dydis išimtas. */
export function extractSize(text: string): { size: ParsedSize | null; rest: string } {
    const lowered = text.toLowerCase();

    const multi = MULTIPACK_RE.exec(lowered);
    if (multi) {
        const base = toSize(toNumber(multi[2]), multi[3]);
        return {
            size: { amount: base.amount * parseInt(multi[1], 10), kind: base.kind },
            rest: lowered.replace(multi[0], " "),
        };
    }

    const multiRev = MULTIPACK_REV_RE.exec(lowered);
    if (multiRev) {
        const base = toSize(toNumber(multiRev[1]), multiRev[2]);
        return {
            size: { amount: base.amount * parseInt(multiRev[3], 10), kind: base.kind },
            rest: lowered.replace(multiRev[0], " "),
        };
    }

    const single = SINGLE_RE.exec(lowered);
    if (single) {
        return { size: toSize(toNumber(single[1]), single[2]), rest: lowered.replace(single[0], " ") };
    }

    const pcs = PCS_RE.exec(lowered);
    if (pcs) {
        return { size: { amount: parseInt(pcs[1], 10), kind: "pcs" }, rest: lowered.replace(pcs[0], " ") };
    }

    return { size: null, rest: lowered };
}

function sizeToKey(size: ParsedSize | null): string {
    return size ? `${size.amount}${size.kind === "pcs" ? "pcs" : size.kind}` : "";
}

function tokenize(text: string): string[] {
    const withPercent = stripDiacritics(text)
        .replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_m, n: string) => ` ${String(parseFloat(n.replace(",", ".")))}pct `)
        // "V.S.O.P" -> "vsop", "O.B." -> "ob": taškai tarp pavienių raidžių išmetami
        .replace(/(?<=\b[a-z])\.(?=[a-z]\b)/g, "")
        // "pad.su" / "J.P.CHENET" -> žodžiai atskiriami (tarp raidžių taškas = tarpas)
        .replace(/(?<=[a-z])\.(?=[a-z])/g, " ");

    const tokens = withPercent
        .replace(/(?<=[a-z])\.(?=[a-z])/g, " ") // "raud.saus.vynas" -> "raud saus vynas"
        .replace(/[^a-z0-9.\s]+/g, " ")
        .split(/\s+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ""))
        .filter((t) => t.length > 1 && !STOPWORDS.has(t));

    return [...new Set(tokens)].sort();
}

/**
 * @param name              prekės pavadinimas
 * @param measurementUnit   parduotuvės pateiktas vienetas ("300 g", "kg", "vnt.")
 */
/** Pavadinimo valymas prieš raktą: apostrofai, "Nr. 12", brandinimo metai, inicialai su taškais. */
function cleanName(name: string): string {
    return name
        .replace(/['’`´]/g, "") // LAY'S -> LAYS, L'OR -> LOR
        .replace(/\bNr\.?\s*\d+/gi, " ") // "Nr. 166" – tai ne produkto skiriamasis požymis
        .replace(/(\d+)\s*(?:y\.?\s?o\b\.?|years?\s+old\b|years?\b|metų)/gi, "$1yo") // 12 YEARS / 12 YO / 10Y.O. -> 12yo
        .replace(/\b([A-Za-z])\.(?=[A-Za-z]\b)/g, "$1"); // J.P.CHENET -> JP.CHENET, O.B. -> OB.
}

export function makeGroupKey(name: string, measurementUnit?: string): string {
    name = cleanName(name);
    const fromName = extractSize(name);
    let size = fromName.size;

    // Dydis iš vieneto (pvz. Lidl "300 g"), jei pavadinime jo nėra.
    if (!size && measurementUnit) size = extractSize(measurementUnit).size;

    // Lygiai 1 kg / 1 l į raktą nededam: parduotuvės tai rašo nenuosekliai
    // ("Bananai" vs "Bananai, 1 kg"), o mums svarbu, kad jos susijungtų.
    if (size && size.amount === 1000 && size.kind !== "pcs") size = null;

    const tokens = tokenize(applyAliases(fromName.rest));
    return `${tokens.join(" ")}|${sizeToKey(size)}`;
}