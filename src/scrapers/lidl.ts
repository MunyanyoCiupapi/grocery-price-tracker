import type { Product, StorePrices } from "../types/products";

/**
 * ============================================================
 * LIDL V10 SCRAPER
 * ============================================================
 *
 * Pakeitimai nuo V9 (paremti TIKRU atsakymu, kurį atsiuntei):
 *
 * 1. "q=" paieška NEVEIKIA (ignoruojama) — atsisakyta.
 *
 * 2. Naudojamas tas pats /q/api/search endpoint'as, kurį naudoja
 *    pats lidl.lt kategorijos puslapis (be "q" parametro). Jis
 *    grąžina VISĄ internetu matomą asortimentą (numFound ≈ 150),
 *    tad tereikia jį išpuslapiuoti.
 *
 * 3. Parametras būtinai "fetchsize" mažosiomis (ne "fetchSize") —
 *    kitaip serveris tyliai grąžina numatytus 36.
 *
 * 4. Duomenys imami iš items[].gridbox.data:
 *      title / fullTitle, price.price, price.oldPrice,
 *      price.packaging.text, canonicalUrl, image.
 *
 * 5. Maisto/buities prekės atskiriamos ne pagal pavadinimą, o pagal
 *    gridbox.meta.wonCategoryBreadcrumbs šaknį (10068374 =
 *    "Maistas, gėrimai ir buities prekės"). Įrankiai ir pan. šios
 *    šaknies neturi.
 *
 * SVARBU: tai ~150 produktų (daugiausia savaitės pasiūlymai), o ne
 * pilnas katalogas. Lidl LT tokio neturi.
 */

/* ============================================================
 * CONFIG
 * ============================================================
 */

const LIDL_BASE_URL = "https://www.lidl.lt";

const SEARCH_ENDPOINT = `${LIDL_BASE_URL}/q/api/search`;

const API_VERSION = "2.1.0";
const ASSORTMENT = "LT";
const LOCALE = "lt_LT";

const FOOD_ROOT_CATEGORY_ID = "10068374";
const FOOD_ROOT_CATEGORY_NAME = "Maistas, gėrimai ir buities prekės";

const PAGE_SIZE = 100; // maxfetchsize = 1000, bet 100 pakanka
const REQUEST_DELAY_MS = 1500;
const REQUEST_RETRIES = 5;
const MAX_PAGES = 20; // apsauga nuo begalinio ciklo

/* ============================================================
 * RAW TYPES (pagal tikrą atsakymą)
 * ============================================================
 */

interface LidlPriceBlock {
  price?: number;
  oldPrice?: number;
  packaging?: { text?: string };
}

interface LidlBreadcrumb {
  id?: string;
  name?: string;
}

interface LidlGridboxData {
  title?: string;
  fullTitle?: string;
  canonicalUrl?: string;
  canonicalPath?: string;
  image?: string;
  productId?: number | string;
  erpNumber?: string;
  price?: LidlPriceBlock;
  keyfacts?: {
    title?: string;
    analyticsCategory?: string;
  };
}

interface LidlItem {
  code?: string;
  gridbox?: {
    data?: LidlGridboxData;
    meta?: {
      wonCategoryBreadcrumbs?: LidlBreadcrumb[][];
    };
  };
}

interface LidlResponse {
  numFound?: number;
  offset?: number;
  fetchsize?: number;
  items?: LidlItem[];
}

/* ============================================================
 * HELPERS
 * ============================================================
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function buildUrl(offset: number): string {
  const params = new URLSearchParams();
  params.set("isEmbedded", "true");
  params.set("onlyGrid", "true");
  params.set("wonCategory", FOOD_ROOT_CATEGORY_ID);
  params.set("wonCategoryName", FOOD_ROOT_CATEGORY_NAME);
  params.set("sort", "storeStartDate-desc");
  params.set("locale", LOCALE);
  params.set("assortment", ASSORTMENT);
  params.set("version", API_VERSION);
  params.set("offset", String(offset));
  // MAŽOSIOS raidės — "fetchSize" serveris ignoruoja.
  params.set("fetchsize", String(PAGE_SIZE));
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

async function fetchPage(offset: number, attempt = 1): Promise<LidlResponse> {
  try {
    const response = await fetch(buildUrl(offset), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 2000 * Math.pow(2, attempt - 1);
      console.warn(`   ⏳ HTTP 429, laukiama ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      if (attempt >= REQUEST_RETRIES) throw new Error("HTTP 429 (baigti bandymai)");
      return fetchPage(offset, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as LidlResponse;
  } catch (error) {
    if (attempt < REQUEST_RETRIES) {
      await sleep(500 * attempt);
      return fetchPage(offset, attempt + 1);
    }
    throw error;
  }
}

function isFoodOrHousehold(item: LidlItem): boolean {
  const breadcrumbs = item.gridbox?.meta?.wonCategoryBreadcrumbs ?? [];
  for (const path of breadcrumbs) {
    if (path?.[0]?.id === FOOD_ROOT_CATEGORY_ID) return true;
  }
  return item.gridbox?.data?.keyfacts?.analyticsCategory === "Food";
}

function toProduct(item: LidlItem): Product | undefined {
  const data = item.gridbox?.data;
  if (!data) return undefined;

  if (!isFoodOrHousehold(item)) return undefined;

  // Kai prekės ženklo nėra, fullTitle prasideda "- " — naudojam title.
  const rawName = cleanText(data.title ?? data.keyfacts?.title ?? data.fullTitle ?? "");
  const name = rawName.replace(/^-\s*/, "");
  if (!name) return undefined;

  const price = data.price?.price;
  if (typeof price !== "number" || price <= 0) return undefined;

  const path = data.canonicalUrl ?? data.canonicalPath ?? "";
  if (!path) return undefined;
  const url = path.startsWith("http")
    ? path
    : `${LIDL_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  const oldPriceRaw = data.price?.oldPrice;
  const hasOldPrice = typeof oldPriceRaw === "number" && oldPriceRaw > price;

  const packaging = cleanText(data.price?.packaging?.text);

  const storePrice: StorePrices = {
    store: "LIDL",
    price,
    url,
    isOnSale: hasOldPrice,
    ...(hasOldPrice ? { oldPrice: oldPriceRaw } : {}),
    // Kaina galioja visai pakuotei (pvz. "750 g"), todėl ją ir rodom.
    ...(packaging ? { measurementUnit: packaging } : {}),
  };

  const idSource = data.productId ?? data.erpNumber ?? item.code ?? url;
  const imageUrl = data.image;

  return {
    id: `lidl-${String(idSource)}`,
    name,
    description: packaging ? `${name}, ${packaging}` : name,
    prices: [storePrice],
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/* ============================================================
 * SCRAPE
 * ============================================================
 */

export async function scrapeLidl(): Promise<Product[]> {
  console.log("");
  console.log("==========================================");
  console.log("🛒 LIDL V10 SCRAPER");
  console.log("==========================================");

  const rawItems: LidlItem[] = [];

  let offset = 0;
  let total = Infinity;

  for (let page = 1; page <= MAX_PAGES && offset < total; page += 1) {
    console.log(`\n📄 Puslapis ${page} (offset=${offset})...`);

    const response = await fetchPage(offset);
    const items = response.items ?? [];

    if (page === 1) {
      total = response.numFound ?? items.length;
      console.log(`   numFound: ${total} | fetchsize: ${response.fetchsize ?? "?"}`);
    }

    console.log(`   Gauta įrašų: ${items.length}`);

    if (items.length === 0) break;

    rawItems.push(...items);
    offset += items.length;

    if (offset < total) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n📦 Iš viso žaliavinių įrašų: ${rawItems.length}`);

  const map = new Map<string, Product>();
  let skipped = 0;

  for (const item of rawItems) {
    const product = toProduct(item);
    if (!product) {
      skipped += 1;
      continue;
    }
    map.set(product.id, product);
  }

  const products = [...map.values()];

  console.log(`🍎 Maisto/buities produktų: ${products.length}`);
  console.log(`🚫 Praleista (ne maistas / be kainos / be URL): ${skipped}`);

  return products;
}

/* ============================================================
 * MAIN
 * ============================================================
 */

async function main(): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");

  const here = path.dirname(fileURLToPath(import.meta.url));

  const products = await scrapeLidl();

  const dataDir = path.join(here, "data", "lidl");
  fs.mkdirSync(dataDir, { recursive: true });

  if (products.length > 0) {
    const file = path.join(dataDir, "lidl_visi.json");
    fs.writeFileSync(file, JSON.stringify(products, null, 2), "utf-8");
    console.log(`\n💾 Išsaugota: data/lidl/lidl_visi.json (Viso: ${products.length})`);
  } else {
    console.log("\n⚠️ Produktų negauta — failas nesukurtas.");
  }

  for (const product of products.slice(0, 10)) {
    const sp = product.prices[0];
    console.log(
      `🛒 ${product.name} | ${sp.price.toFixed(2)} €` +
        (sp.oldPrice !== undefined ? ` (buvo ${sp.oldPrice.toFixed(2)} €)` : "") +
        (sp.measurementUnit ? ` | ${sp.measurementUnit}` : ""),
    );
  }
}

const executedFile = process.argv[1] ?? "";
const normalized = executedFile.replace(/\\/g, "/").toLowerCase();
const isDirectExecution =
  normalized.endsWith("/lidl.ts") || normalized.endsWith("/lidl.js") || normalized.endsWith("/lidl");

if (isDirectExecution) {
  main().catch((error) => {
    console.error("\n💥 Lidl scraper klaida:");
    console.error(error);
    process.exitCode = 1;
  });
}