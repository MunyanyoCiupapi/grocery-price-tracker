import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page } from "playwright";
import { createHash } from "node:crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product, StorePrices } from "../types/products";

chromium.use(stealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * RIMI V2 (greitesnė versija)
 *
 * Kas pakeista:
 *  1. "networkidle" -> "domcontentloaded" (nebelaukiam, kol nurims visas tinklas)
 *  2. Blokuojami paveikslėliai / šriftai / media (kaip Barbora scraperyje).
 *     Jei nuotraukų nuorodos pasidarytų tuščios – pakeisk BLOCK_IMAGES į false.
 *  3. Po "Kitas puslapis" paspaudimo laukiam, kol pasikeis pirma prekė,
 *     o ne fiksuotų 3–4 sekundžių.
 *  4. Kelios kategorijos vienu metu (CONCURRENCY, numatyta 3).
 *     Galima keisti:  RIMI_CONCURRENCY=2 npx tsx rimi
 */

const BLOCK_IMAGES = true;
const CONCURRENCY = Number(process.env.RIMI_CONCURRENCY ?? 3);

const CATEGORIES = [
    "https://www.rimi.lt/e-parduotuve/lt/produktai/vaisiai-darzoves-ir-geles/c/SH-15",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/augaliniai-produktai/c/SH-77",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/pieno-produktai-ir-kiausiniai/c/SH-11",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/duonos-gaminiai-/c/SH-3",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/mesa-ir-zuvis-/c/SH-9",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/saldytas-maistas/c/SH-13",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/bakaleja/c/SH-2",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/rimi-konditerija-ir-kulinarija/c/SH-34",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/vaiku-ir-kudikiu-prekes/c/SH-7",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/saldumynai-ir-uzkandziai/c/SH-23",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/gerimai/c/SH-4",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/alkoholiniai-ir-nealkoholiniai-gerimai/c/SH-1",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/kosmetika-ir-higiena/c/SH-6",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/buitines-chemijos-ir-valymo-priemones/c/SH-16",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/gyvunu-prekes/c/SH-5",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/namu-ukio-ir-laisvalaikio-prekes/c/SH-10",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/-vikis-prekiu-krautuvele/c/SH-18",
    "https://www.rimi.lt/e-parduotuve/lt/produktai/-honest-bite-prekiu-krautuvele/c/SH-30",
];

const randomDelay = (min: number, max: number) =>
    new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

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

function categorySlugFromUrl(baseUrl: string): string {
    const urlPathObj = new URL(baseUrl);
    let pathSegments = urlPathObj.pathname.split("/").filter(Boolean);

    if (pathSegments.includes("c")) {
        pathSegments = pathSegments.slice(0, pathSegments.indexOf("c"));
    }

    pathSegments = pathSegments.filter((seg) => seg !== "e-parduotuve" && seg !== "lt" && seg !== "produktai");

    return (
        pathSegments
            .map((seg) => seg.replace(/^-+|-+$/g, ""))
            .filter(Boolean)
            .join("_") || "kategorija"
    );
}

function normalizeProductUrl(rawUrl: string): string {
    const url = new URL(rawUrl, "https://www.rimi.lt");
    url.hash = "";
    url.search = "";
    return url.href.replace(/\/+$/, "");
}

function makeProductId(productUrl: string): string {
    const normalizedUrl = normalizeProductUrl(productUrl);
    const hash = createHash("sha256").update(normalizedUrl).digest("hex");
    return `rimi-${hash}`;
}

async function extractItems(page: Page) {
    return page
        .evaluate(() => {
            const items: any[] = [];
            const cards = document.querySelectorAll("li.product-grid__item");

            cards.forEach((card) => {
                const titleEl = card.querySelector(".card__name");
                const title = titleEl ? titleEl.textContent?.trim() : "";
                if (!title) return;

                const linkEl = card.querySelector("a.card__url") as HTMLAnchorElement;
                const href = linkEl ? linkEl.getAttribute("href") : "";
                if (!href) return;
                const fullUrl = href.startsWith("http") ? href : "https://www.rimi.lt" + href;

                const imgEl = card.querySelector("img.card__image") || card.querySelector("img");
                const imageUrl = imgEl ? imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || undefined : undefined;

                let price = 0;
                let oldPrice: number | undefined = undefined;
                let isOnSale = false;

                const srOnlyEl = card.querySelector(".card__price .sr-only");
                if (srOnlyEl) {
                    const match = (srOnlyEl.textContent || "").replace(",", ".").match(/(\d+\.\d+|\d+)/);
                    if (match) price = parseFloat(match[0]);
                } else {
                    const euroEl = card.querySelector(".card__price [aria-hidden='true']");
                    const centEl = card.querySelector(".card__price sup");
                    if (euroEl && centEl) {
                        const euroText = euroEl.textContent ? euroEl.textContent.trim() : "0";
                        const centText = centEl.textContent ? centEl.textContent.trim() : "00";
                        price = parseFloat(euroText + "." + centText);
                    }
                }

                const oldPriceEl = card.querySelector(".card__old-price, .old-price, .price-badge--discount");
                if (oldPriceEl) {
                    const oldMatch = (oldPriceEl.textContent || "").replace(",", ".").match(/(\d+\.\d+|\d+)/);
                    if (oldMatch) {
                        oldPrice = parseFloat(oldMatch[0]);
                        if (oldPrice > price) isOnSale = true;
                    }
                }

                if (!price || price <= 0) return;

                let measurementUnit = "vnt.";
                const pricePer = card.querySelector(".card__price-per")?.textContent || "";
                if (pricePer.includes("kg") || title.toLowerCase().includes("kg")) measurementUnit = "kg";
                else if (pricePer.includes("l")) measurementUnit = "l";

                items.push({ title, price, oldPrice, isOnSale, measurementUnit, fullUrl, imageUrl });
            });

            return items;
        })
        .catch(() => [] as any[]);
}

async function scrollToBottom(page: Page) {
    await page
        .evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 800;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve(undefined);
                    }
                }, 40);
            });
        })
        .catch(() => {});
}

(async () => {
    const startedAt = Date.now();
    console.log(`🚀 Paleidžiama Rimi V2 (lygiagrečiai kategorijų: ${CONCURRENCY})...`);

    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    const blocked = BLOCK_IMAGES ? ["image", "font", "media"] : ["font", "media"];
    await context.route("**/*", (route) => {
        if (blocked.includes(route.request().resourceType())) route.abort();
        else route.continue();
    });

    const visitedUrls = new Set<string>();

    const dataDir = path.join(__dirname, "data", "rimi");
    fs.mkdirSync(dataDir, { recursive: true });

    async function scrapeCategory(baseUrl: string, index: number) {
        const tag = `[${index + 1}/${CATEGORIES.length}]`;
        const slug = categorySlugFromUrl(baseUrl);
        console.log(`\n${tag} 🌐 Pradedama: ${slug}`);

        const page = await context.newPage();
        const categoryProducts: Product[] = [];

        try {
            let loaded = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
                    loaded = true;
                    break;
                } catch (e) {
                    console.log(`${tag} ⚠️ Bandymas ${attempt}/3 nepavyko`);
                    await randomDelay(2000, 4000);
                }
            }
            if (!loaded) {
                console.log(`${tag} ❌ Nepavyko pasiekti kategorijos, praleidžiama.`);
                return;
            }

            try {
                const cookieBtn = await page.$("#onetrust-accept-btn-handler, button[id*='accept']");
                if (cookieBtn) {
                    await cookieBtn.click();
                    await randomDelay(500, 900);
                }
            } catch (err) {}

            let currentPage = 1;

            while (true) {
                if (page.isClosed()) break;

                await scrollToBottom(page);
                await randomDelay(300, 600);

                const selectorLoaded = await page.waitForSelector("li.product-grid__item", { timeout: 15000 }).catch(() => false);
                if (!selectorLoaded) {
                    console.log(`${tag} ⚠️ Produktų nerasta (puslapis ${currentPage}).`);
                    break;
                }

                const rawItems = await extractItems(page);
                if (rawItems.length === 0) {
                    console.log(`${tag} 🏁 Puslapis tuščias.`);
                    break;
                }

                let newItemsInPage = 0;
                for (const item of rawItems) {
                    if (item.fullUrl && !visitedUrls.has(item.fullUrl)) {
                        visitedUrls.add(item.fullUrl);
                        newItemsInPage++;

                        const storePrice: StorePrices = {
                            store: "RIMI",
                            price: item.price,
                            ...(item.oldPrice !== undefined && { oldPrice: item.oldPrice }),
                            isOnSale: item.isOnSale,
                            measurementUnit: item.measurementUnit,
                            url: item.fullUrl,
                        };

                        const productId = makeProductId(item.fullUrl);

                        categoryProducts.push({
                            id: productId,
                            name: item.title,
                            description: item.title,
                            prices: [storePrice],
                            imageUrl: item.imageUrl,
                        });
                    }
                }

                console.log(`${tag} 📄 ${slug} p.${currentPage}: rasta ${rawItems.length}, naujų ${newItemsInPage}`);

                if (newItemsInPage === 0) break;

                const hasNext = await page
                    .evaluate(() => {
                        const btn = document.querySelector(".pagination__item--next, [rel='next']") as HTMLElement;
                        if (!btn) return false;
                        const parentLi = btn.closest("li");
                        if (parentLi && parentLi.classList.contains("disabled")) return false;
                        return true;
                    })
                    .catch(() => false);
                if (!hasNext) break;

                const firstHref = await page
                    .evaluate(() => document.querySelector("li.product-grid__item a.card__url")?.getAttribute("href") ?? "")
                    .catch(() => "");

                const navigated = await page
                    .evaluate(() => {
                        const nextEl = document.querySelector(".pagination__item--next a, [rel='next']") as HTMLElement;
                        if (nextEl) {
                            nextEl.click();
                            return true;
                        }
                        return false;
                    })
                    .catch(() => false);
                if (!navigated) break;

                currentPage++;

                const changed = await page
                    .waitForFunction(
                        (prev: string) => {
                            const a = document.querySelector("li.product-grid__item a.card__url");
                            return !!a && a.getAttribute("href") !== prev;
                        },
                        firstHref,
                        { timeout: 15000 },
                    )
                    .then(() => true)
                    .catch(() => false);

                if (changed) await randomDelay(300, 700);
                else await randomDelay(2500, 3500);
            }
        } finally {
            if (!page.isClosed()) await page.close().catch(() => {});
        }

        if (categoryProducts.length > 0) {
            const fileName = "rimi_" + slug + ".json";
            fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(categoryProducts, null, 2), "utf-8");
            console.log(`${tag} 💾 data/rimi/${fileName} (Viso: ${categoryProducts.length})`);
        }
    }

    await runPool(CATEGORIES, CONCURRENCY, async (url, i) => {
        try {
            await scrapeCategory(url, i);
        } catch (e) {
            console.log(`[${i + 1}] 💥 Kategorijos klaida:`, (e as Error).message);
        }
    });

    await browser.close().catch(() => {});

    const secs = Math.round((Date.now() - startedAt) / 1000);
    console.log(`\n🎉 Rimi baigta! Unikalių prekių: ${visitedUrls.size} | Trukmė: ${secs}s`);
})();