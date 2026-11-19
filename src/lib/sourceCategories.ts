/** Svetainės kategorijos atitinka surinkėjų naudojamas parduotuvių kategorijas. */
export const CATEGORY_OPTIONS = [
    { id: "", label: "Visos prekės" },
    { id: "vaisiai", label: "Vaisiai ir daržovės" },
    { id: "pieno", label: "Pieno produktai, kiaušiniai ir majonezas" },
    { id: "mesa", label: "Mėsa, žuvis ir kulinarija" },
    { id: "duona", label: "Duona ir konditerija" },
    { id: "bakaleja", label: "Bakalėja ir paruoštas maistas" },
    { id: "gerimai", label: "Gėrimai" },
    { id: "saldumynai", label: "Saldumynai, užkandžiai ir kava" },
    { id: "saldyti", label: "Šaldyti produktai" },
    { id: "vaikai", label: "Kūdikių ir vaikų prekės" },
    { id: "grozis", label: "Grožis ir higiena" },
    { id: "namai", label: "Namai, buitis ir augintiniai" },
    { id: "sveikata", label: "Sveikata" },
    { id: "laisvalaikis", label: "Laisvalaikis ir kanceliarija" },
    { id: "sventes", label: "Gėlės, dovanos ir šventės" },
    { id: "pasaulio", label: "Pasaulio virtuvės" },
    { id: "kitos", label: "Kitos ir nesuskirstytos" },
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number]["id"];

// Failų pavadinimai atspindi kategorijų puslapius, iš kurių scraperiai surinko prekes.
// Nesuprantamų ir per plačių kategorijų nespėjame iš prekės pavadinimo.
const SOURCES: Record<string, Record<string, Exclude<Category, "">>> = {
    RIMI: {
        vaisiai_darzoves_ir_geles: "vaisiai",
        pieno_produktai_ir_kiausiniai: "pieno",
        mesa_ir_zuvis: "mesa",
        duonos_gaminiai: "duona",
        bakaleja: "bakaleja",
        gerimai: "gerimai",
        alkoholiniai_ir_nealkoholiniai_gerimai: "gerimai",
        saldumynai_ir_uzkandziai: "saldumynai",
        saldytas_maistas: "saldyti",
        vaiku_ir_kudikiu_prekes: "vaikai",
        kosmetika_ir_higiena: "grozis",
        buitines_chemijos_ir_valymo_priemones: "namai",
        gyvunu_prekes: "namai",
        namu_ukio_ir_laisvalaikio_prekes: "namai",
    },
    MAXIMA: {
        darzoves_ir_vaisiai: "vaisiai",
        vaisiai_darzoves_ir_geles: "vaisiai",
        pieno_gaminiai_kiausiniai_ir_majonezas: "pieno",
        mesa_zuvis_ir_kulinarija: "mesa",
        duonos_gaminiai_ir_konditerija: "duona",
        bakaleja: "bakaleja",
        gerimai: "gerimai",
        saldytas_maistas: "saldyti",
        kudikiu_ir_vaiku_prekes: "vaikai",
        kosmetika_ir_higiena: "grozis",
        svaros_ir_gyvunu_prekes: "namai",
        namai_ir_laisvalaikis: "namai",
    },
};

export interface IkiCategory {
    id: string;
    parentId?: string;
    name?: { lt?: string };
}

const IKI_ROOTS: Record<string, Exclude<Category, "">> = {
    "Vaisiai ir daržovės": "vaisiai",
    "Pieno produktai ir kiaušiniai": "pieno",
    "Mėsa, žuvis ir kulinarija": "mesa",
    "Žuvis ir jūros gėrybės": "mesa",
    "Duonos gaminiai ir konditerija": "duona",
    "Bakalėja": "bakaleja",
    "Gėrimai": "gerimai",
    "Alkoholiniai gėrimai": "gerimai",
    "Saldumynai ir užkandžiai": "saldumynai",
    "Šaldytas maistas": "saldyti",
    "Kūdikių ir vaikų prekės": "vaikai",
    "Kosmetika ir higiena": "grozis",
    "Buitinė chemija, valymo prekės": "namai",
    "Gyvūnų prekės": "namai",
    "Namų ir buities prekės": "namai",
    "Laisvalaikio ir turizmo prekės": "namai",
    "Maisto papildai": "sveikata",
    "Knygos, žurnalai": "laisvalaikis",
    "Kanceliarinės prekės": "laisvalaikis",
    "Gėlės, dovanos, šventinė atributika": "sventes",
    "Kalėdinės prekės": "sventes",
    "Kalėdų eglutės, kėniai, puansetijos": "sventes",
    "Šventiniai užkandžiai": "sventes",
    "Šventiniam stalui": "sventes",
    "Gėrimai šventėms": "gerimai",
    "Pasaulio virtuvės": "pasaulio",
};

export function ikiRootCategory(id: string, categories: Map<string, IkiCategory>): IkiCategory | undefined {
    const visited = new Set<string>();
    let current = categories.get(id);
    while (current) {
        if (visited.has(current.id)) return undefined;
        visited.add(current.id);
        if (!current.parentId || current.parentId === "0") return current;
        current = categories.get(current.parentId);
    }
    return undefined;
}

export function ikiSourceCategory(id: string, categories: Map<string, IkiCategory>): Exclude<Category, ""> | undefined {
    const name = ikiRootCategory(id, categories)?.name?.lt?.trim();
    return name && Object.hasOwn(IKI_ROOTS, name) ? IKI_ROOTS[name] : undefined;
}

export function sourceCategory(store: string, fileName: string): Exclude<Category, ""> | undefined {
    const prefix = store === "MAXIMA" ? "barbora" : store.toLowerCase();
    const stem = fileName.toLowerCase().replace(/\.json$/, "").replace(/-/g, "_");
    const name = stem.startsWith(`${prefix}_`) ? stem.slice(prefix.length + 1) : stem;
    return Object.hasOwn(SOURCES, store) && Object.hasOwn(SOURCES[store], name)
        ? SOURCES[store][name]
        : undefined;
}
