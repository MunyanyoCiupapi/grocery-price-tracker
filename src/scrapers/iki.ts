import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product, StorePrices } from "../types/products";
import { ikiRootCategory, ikiSourceCategory, type IkiCategory } from "../lib/sourceCategories";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IKI tinklo (chain) ID LastMile sistemoje:
const IKI_CHAIN_ID = "CvKfTzV4TN5U8BTMF1Hl";

const API_URL = "https://searchservice-952707942140.europe-north1.run.app/v1/frontend-products";
const CATEGORIES_URL = "https://searchservice-952707942140.europe-north1.run.app/categories";

async function fetchCategories(): Promise<Map<string, IkiCategory>> {
  const response = await fetch(CATEGORIES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://www.lastmile.lt", Referer: "https://www.lastmile.lt/chain/IKI/categories" },
    body: JSON.stringify({ params: { type: "categories", show: true, chainIds: [IKI_CHAIN_ID] }, isUsingCache: true, slim: ["id", "name", "parentId"] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`IKI kategorijų užklausa nepavyko: HTTP ${response.status}`);
  const body: { data?: IkiCategory[]; count?: number } = await response.json();
  if (!Array.isArray(body.data) || !body.data.length || (typeof body.count === "number" && body.data.length < body.count)) {
    throw new Error("IKI kategorijų sąrašas tuščias arba nepilnas; seni failai neperrašomi.");
  }
  return new Map(body.data.filter((item) => item && typeof item.id === "string" && item.id).map((item) => [item.id, item]));
}

function groupCategories(categories: Map<string, IkiCategory>): { id: string; name: string; ids: string[] }[] {
  const groups = new Map<string, { id: string; name: string; ids: string[] }>();
  for (const category of categories.values()) {
    const root = ikiRootCategory(category.id, categories);
    if (!root) continue;
    const group = groups.get(root.id) ?? { id: root.id, name: root.name?.lt?.trim() || root.id, ids: [] };
    group.ids.push(category.id);
    groups.set(root.id, group);
  }
  return [...groups.values()];
}

const CONCURRENCY = Number(process.env.IKI_CONCURRENCY ?? 3);

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

const randomDelay = (min: number, max: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

interface LastMilePrc {
  p: number;
  l: number | null;
}

interface LastMileProduct {
  chainId: string;
  categoryId?: string;
  unitOfMeasure: string;
  conversionMeasure: string;
  thumbUrl?: string;
  photoUrl?: string;
  prc: LastMilePrc;
  isActive: boolean;
  isApproved: boolean;
  slugs: string[];
  name: Record<string, string>;
  productId: string;
}

interface LastMileApiWrapper {
  frontEndProduct: LastMileProduct;
}

// API kartais sumažina leistiną limit (klaida "search_limit_too_large") – tada automatiškai mažinam.
const LIMIT_STEPS = [1000, 500, 300, 200, 100, 50];
let limitIdx = 0;
const currentLimit = () => LIMIT_STEPS[limitIdx];

interface FetchResult {
  items: LastMileApiWrapper[];
  count: number; // bendras prekių skaičius kategorijoje pagal API (0 jei nežinomas)
}

async function fetchProducts(categoryIds: string[], sort: string, fromIndex = 0, attempt = 1): Promise<FetchResult> {
  const limit = currentLimit();
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.lastmile.lt",
        Referer: "https://www.lastmile.lt/chain/IKI",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        params: {
          type: "view_products",
          isActive: true,
          isApproved: true,
          chainIds: [IKI_CHAIN_ID],
          categoryIds,
          isUsingStock: true,
          filter: {},
          ...(sort ? { sort } : {}),
        },
        limit,
        fromIndex,
      }),
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      if (res.status === 400 && body.includes("search_limit_too_large") && limitIdx < LIMIT_STEPS.length - 1) {
        // mažinam tik jei kita lygiagreti užklausa jau nesumažino
        if (currentLimit() === limit) {
          limitIdx++;
          console.warn(`   ↘️ API atmetė limit=${limit}, bandoma su ${currentLimit()}...`);
        }
        return fetchProducts(categoryIds, sort, fromIndex, attempt); // be bandymo skaičiaus didinimo
      }
      throw new Error(`HTTP ${res.status}${body ? ` – ${body}` : ""}`);
    }

    const json = await res.json() as { data?: LastMileApiWrapper[]; items?: LastMileApiWrapper[]; products?: LastMileApiWrapper[]; count?: number } | LastMileApiWrapper[];

    const items: LastMileApiWrapper[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.items)
          ? json.items
          : Array.isArray(json?.products)
            ? json.products
            : [];

    return { items, count: !Array.isArray(json) && typeof json?.count === "number" ? json.count : 0 };
  } catch (err) {
    if (attempt <= 3) {
      console.warn(`   ⚠️ Užklausa nepavyko (bandymas ${attempt}/3): ${(err as Error).message}. Bandoma iš naujo...`);
      await randomDelay(1500 * attempt, 2500 * attempt);
      return fetchProducts(categoryIds, sort, fromIndex, attempt + 1);
    }
    console.error(`   ❌ Nepavyko po 3 bandymų kategorijoms [${categoryIds.slice(0, 2).join(", ")}...]:`, err);
    throw err;
  }
}

/** Kainų šaltinis puslapiuoja su fromIndex; vienai rūšiavimo krypčiai grąžina iki 2000 įrašų. */
async function fetchAll(categoryIds: string[]): Promise<FetchResult> {
  const byId = new Map<string, LastMileApiWrapper>();
  let expected = 0;
  const collect = async (sort: string) => {
    let offset = 0;
    let pages = 0;
    while (offset < 2000 && pages < 100) {
      const result = await fetchProducts(categoryIds, sort, offset);
      if (offset === 0 && result.count > 0) expected = Math.max(expected, result.count);
      if (!result.items.length) break;
      for (const w of result.items) {
        const id = w.frontEndProduct?.productId;
        if (id && !byId.has(id)) byId.set(id, w);
      }
      offset += result.items.length;
      pages++;
      if (expected > 0 && offset >= expected) break;
    }
  };
  await collect("priceAsc");
  // Didelėms kategorijoms antra rūšiavimo kryptis leidžia gauti ir kitą lango galą.
  if (expected > byId.size) await collect("priceDesc");
  return { items: [...byId.values()], count: expected };
}

function mapUnit(conversionMeasure: string, unitOfMeasure: string): string {
  const c = (conversionMeasure || "").toUpperCase();
  if (c === "KG") return "kg";
  if (c === "L") return "l";
  const u = (unitOfMeasure || "").toUpperCase();
  if (u === "KG") return "kg";
  if (u === "L") return "l";
  return "vnt.";
}

function toProduct(wrapper: LastMileApiWrapper, categories: Map<string, IkiCategory>): Product | null {
  const p = wrapper.frontEndProduct;
  if (!p || p.chainId !== IKI_CHAIN_ID) return null;
  if (!p.isActive || !p.isApproved) return null;

  const name = p.name?.lt || p.name?.en || Object.values(p.name || {})[0];
  if (!name) return null;

  const regularPrice = p.prc?.p;
  const loyaltyPrice = p.prc?.l;
  if (typeof regularPrice !== "number" || regularPrice <= 0) return null;

  const currentPrice = typeof loyaltyPrice === "number" && loyaltyPrice > 0 ? loyaltyPrice : regularPrice;
  const isOnSale = typeof loyaltyPrice === "number" && loyaltyPrice > 0 && loyaltyPrice < regularPrice;

  const slug = p.slugs?.[0];
  const category = p.categoryId ? ikiSourceCategory(p.categoryId, categories) : undefined;
  const url = slug ? `https://www.lastmile.lt/chain/IKI/product/${slug}` : `https://www.lastmile.lt/chain/IKI`;

  const storePrice: StorePrices = {
    store: "IKI",
    price: currentPrice,
    ...(isOnSale && { oldPrice: regularPrice }),
    isOnSale,
    measurementUnit: mapUnit(p.conversionMeasure, p.unitOfMeasure),
    url,
  };

  return {
    id: "iki-" + p.productId,
    name,
    description: name,
    prices: [storePrice],
    imageUrl: p.thumbUrl || p.photoUrl || undefined,
    ...(category ? { categoryCodes: [category] } : {}),
    ...(p.categoryId ? { sourceCategoryId: p.categoryId } : {}),
  };
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

(async () => {
  const startedAt = Date.now();
  console.log(`🚀 IKI (per LastMile) V2 – lygiagrečiai grupių: ${CONCURRENCY}\n`);

  const categories = await fetchCategories();
  const categoryGroups = groupCategories(categories);
  if (!categoryGroups.length) throw new Error("IKI kategorijų hierarchija tuščia.");
  console.log(`📂 IKI kategorijos: ${categories.size}, pagrindinių grupių: ${categoryGroups.length}`);

  const dataDir = path.join(__dirname, "data", "iki");
  fs.mkdirSync(dataDir, { recursive: true });

  const seenIds = new Set<string>();
  const writtenFiles: string[] = [];
  const runId = Date.now().toString(36);
  let totalSaved = 0;
  let totalMissing = 0; // prekės, kurių API neatidavė dėl limit

  await runPool(categoryGroups, CONCURRENCY, async (group, i) => {
    const tag = `[${i + 1}/${categoryGroups.length}]`;
    console.log(`${tag} Kraunama: "${group.name}" (${group.ids.length} subkategorijos)...`);

    const initial = await fetchAll(group.ids);
    let items = initial.items;

    // Jei ir po abiejų krypčių trūksta rezultatų, papildomai tikriname atskiras subkategorijas.
    if (initial.count > items.length && group.ids.length > 1) {
      console.log(`${tag} ⚠️ Gauta ${items.length} iš ${initial.count}, papildomai kraunamos subkategorijos...`);
      const allItems = new Map(items.map((item) => [item.frontEndProduct?.productId, item]));
      await runPool(group.ids, 3, async (singleCategoryId) => {
        const single = await fetchAll([singleCategoryId]);
        for (const item of single.items) if (item.frontEndProduct?.productId) allItems.set(item.frontEndProduct.productId, item);
        await randomDelay(100, 300);
      });
      items = [...allItems.values()];
    }
    if (initial.count > items.length) {
      totalMissing += initial.count - items.length;
      console.warn(`${tag} ⚠️ ${group.name}: gauta ${items.length} iš ${initial.count} šaltinio nurodytų prekių.`);
    }

    const groupProducts: Product[] = [];
    for (const wrapper of items) {
      const productId = wrapper.frontEndProduct?.productId;
      if (!productId || seenIds.has(productId)) continue;

      const product = toProduct(wrapper, categories);
      if (!product) continue;

      seenIds.add(productId);
      groupProducts.push(product);
    }

    if (groupProducts.length > 0) {
      const fileName = `iki_auto_${runId}_${sanitizeFileName(group.name)}_${group.id}.json`;
      fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(groupProducts, null, 2), "utf-8");
      writtenFiles.push(fileName);
      totalSaved += groupProducts.length;
      console.log(`${tag} ✅ ${group.name}: ${groupProducts.length} unikalių → data/iki/${fileName}`);
    } else {
      console.log(`${tag} ⚪ ${group.name}: naujų produktų nėra`);
    }
  });

  const secs = Math.round((Date.now() - startedAt) / 1000);
  const sourceTotal = (await fetchProducts([], "priceAsc")).count;
  console.log(`\n📊 IKI: surinkta ${totalSaved} unikalių prekių, šaltinis nurodo ${sourceTotal} | Trukmė: ${secs}s`);
  if (sourceTotal > totalSaved) {
    totalMissing += sourceTotal - totalSaved;
    console.warn(`⚠️ Bendrame palyginime trūksta ${sourceTotal - totalSaved} šaltinio nurodytų prekių.`);
  }
  if (totalMissing > 0) {
    console.warn(`⚠️ IKI: dėl API limito trūksta dalies rezultatų (apie ${totalMissing} kategorijų rezultatų, įskaitant pasikartojimus).`);
    // Neleisti suplanuotam darbui laikyti nepilno surinkimo pilnu ir paleisti --prune.
    process.exitCode = 1;
  }

  // Jei nesurinkta nieko – tai klaida (API neatsakė / užblokavo), o ne sėkmė.
  if (totalSaved === 0) {
    console.error("❌ IKI: nesurinkta nė vienos prekės – žr. klaidas aukščiau.");
    process.exit(1);
  }
  // Senų ranka pavadintų failų neištriname, bet nurodome sinchronizavimui, kurie priklauso šiam surinkimui.
  const pendingManifest = path.join(dataDir, `_manifest_${runId}.tmp`);
  fs.writeFileSync(pendingManifest, JSON.stringify({ files: writtenFiles.sort() }, null, 2), "utf-8");
  fs.renameSync(pendingManifest, path.join(dataDir, "_manifest.json"));
})();
