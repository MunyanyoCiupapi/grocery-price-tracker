import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product, StorePrices } from "../types/products";

chromium.use(stealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BARBORA (MAXIMA) V3
 *
 * Kodėl V2 surinko per mažai (9.9k vs Rimi 16.7k / IKI 14.7k):
 *  V2 tyliai nutraukdavo kategoriją, jei kuris nors puslapis nepasikraudavo
 *  (Cloudflare / per greitas tempas). Pvz. "bakaleja" baigėsi ties 104 prekėmis,
 *  "gerimai" ties 416 (lygiai 8 pilni puslapiai) – tai ne pabaiga, o nutrūkimas.
 *
 * Kas pakeista V3:
 *  1. Nepasikrovęs puslapis NEBELAIKOMAS kategorijos pabaiga. Skiriam:
 *       - "ok"      – kortelės yra
 *       - "empty"   – puslapis normalus, bet prekių nėra  -> tikra pabaiga
 *       - "blocked" – Cloudflare / 429 / nepasikrovė      -> kategorija NEBAIGTA
 *  2. Iki 5 bandymų su didėjančia pauze, kiekvienas laukia kortelių iki 15 s.
 *  3. Nebaigtos kategorijos automatiškai kartojamos PO pagrindinio praėjimo
 *     (po 1 vienu metu, su pauze), tęsiant nuo to puslapio, kur sustota.
 *  4. Pabaigoje aiškiai parašoma, kurios kategorijos liko nebaigtos.
 *
 *  Greitis: BARBORA_CONCURRENCY (numatyta 2). Jei vis dar yra nebaigtų – 1.
 */

const CONCURRENCY = Number(process.env.BARBORA_CONCURRENCY ?? 2);
const SCROLL_THRESHOLD = 24;
const MAIN_PASS_ATTEMPTS = 4;
const RETRY_PASS_ATTEMPTS = 6;
const RETRY_PASSES = 3;

const CATEGORIES = [
    "https://barbora.lt/c/KP8A/darzoves-ir-vaisiai",
    "https://barbora.lt/c/JZV8/pieno-gaminiai-kiausiniai-ir-majonezas",
    "https://barbora.lt/c/Z1ZC/duonos-gaminiai-ir-konditerija",
    "https://barbora.lt/c/KVGA/mesa-zuvis-ir-kulinarija",
    "https://barbora.lt/c/8ES4/bakaleja",
    "https://barbora.lt/c/4X7M/saldytas-maistas",
    "https://barbora.lt/c/B331/gerimai",
    "https://barbora.lt/c/5MHL/kudikiu-ir-vaiku-prekes",
    "https://barbora.lt/c/8GL4/kosmetika-ir-higiena",
    "https://barbora.lt/c/V3UD/svaros-ir-gyvunu-prekes",
    "https://barbora.lt/c/U6TX/namai-ir-laisvalaikis",
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

async function extractItems(page: Page) {
    return page
        .evaluate(() => {
            const items: { id: string; title: string; price: number; oldPrice: number | undefined; isOnSale: boolean; unit: string; image: string | undefined; fullUrl: string }[] = [];
            const seen = new Set<string>();
            const recs = document.querySelector("[data-testid='category-recommendations']");

            for (const a of Array.from(document.querySelectorAll("a[href^='/p/']"))) {
                if (recs && recs.contains(a)) continue; // "populiariausios" karuselė – ne kategorijos prekės

                const href = (a.getAttribute("href") || "").split("?")[0];
                if (!href || seen.has(href)) continue;

                // kortelė = didžiausias konteineris, kuriame yra tik ši prekė
                let card: HTMLElement = a as HTMLElement;
                for (let i = 0; i < 8; i++) {
                    const parent = card.parentElement;
                    if (!parent) break;
                    const hrefs = new Set(
                        Array.from(parent.querySelectorAll("a[href^='/p/']")).map((x) => (x.getAttribute("href") || "").split("?")[0]),
                    );
                    if (hrefs.size > 1) break;
                    card = parent;
                }

                const text = (card.innerText || card.textContent || "").replace(/\s+/g, " ");
                if (/išparduota|šiuo metu prekės neturime|laikinai nėra/i.test(text)) continue;

                // pavadinimas: nuoroda su tekstu (kita nuoroda – tik nuotrauka)
                let title = "";
                for (const link of Array.from(card.querySelectorAll("a[href^='/p/']"))) {
                    const t = ((link as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
                    if (t.length > title.length) title = t;
                }
                if (!title) title = card.querySelector("img")?.getAttribute("alt")?.trim() || "";
                if (!title) continue;

                // kainos: "1 . 15 €" (be "€/kg" kainos už vienetą)
                const prices = Array.from(text.matchAll(/(\d{1,4})\s*[.,]\s*(\d{2})\s*€(?!\s*\/)/g)).map((m) =>
                    Number(`${m[1]}.${m[2]}`),
                );
                const price = prices[0];
                if (!price || price <= 0) continue;
                const oldPrice = prices.find((p, idx) => idx > 0 && p > price);

                const unitMatch = text.match(/\d[.,]\d{2}\s*€\s*\/\s*([^\s\d]+)/);
                const imgEl = card.querySelector("img") as HTMLImageElement | null;

                seen.add(href);
                items.push({
                    id: href.replace(/^\/p\//, ""),
                    title,
                    price,
                    oldPrice,
                    isOnSale: oldPrice !== undefined,
                    unit: unitMatch ? unitMatch[1] : "vnt.",
                    image: imgEl?.src || undefined,
                    fullUrl: "https://barbora.lt" + href,
                });
            }
            return items;
        })
        .catch(() => []);
}

type LoadResult = "ok" | "empty" | "blocked";

const BLOCK_PATTERN = /just a moment|attention required|cloudflare|access denied|forbidden|too many requests|error 429|error 403|captcha|verify you are human/i;

/**
 * Atidaro puslapį ir pasako, kas atsitiko:
 *  ok      – produktų kortelės yra
 *  empty   – puslapis atrodo normalus, bet prekių nėra (tikra kategorijos pabaiga)
 *  blocked – užblokuota arba nepasikrovė (NE pabaiga)
 */
async function loadPage(page: Page, url: string, attempts: number, tag: string): Promise<LoadResult> {
    let emptyHits = 0;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 50000 });

            const consent = page.locator("button", { hasText: /leisti visus slapukus/i }).first();
            if ((await consent.count()) > 0) await consent.click({ timeout: 3000 }).catch(() => {});

            const ok = await page.waitForSelector("a[href^='/p/']", { timeout: 15000 }).catch(() => false);
            if (ok) return "ok";

            const info = await page
                .evaluate(() => ({
                    title: document.title || "",
                    text: (document.body?.innerText || "").slice(0, 600),
                }))
                .catch(() => ({ title: "", text: "" }));

            const looksBlocked = BLOCK_PATTERN.test(info.title) || BLOCK_PATTERN.test(info.text) || info.text.trim().length < 20;

            if (!looksBlocked) {
                emptyHits++;
                if (emptyHits >= 2) {
                    console.log(`${tag} 🔍 Tuščio puslapio turinys: "${info.title}" | ${info.text.replace(/\s+/g, " ").slice(0, 160)}`);
                    return "empty";
                }
                await randomDelay(1500, 2500);
                continue;
            }

            console.log(`${tag} 🛑 Atrodo užblokuota / tuščia (bandymas ${attempt}/${attempts}), laukiama...`);
        } catch (e) {
            console.log(`${tag} ⚠️ Klaida kraunant (bandymas ${attempt}/${attempts}): ${(e as Error).message.split("\n")[0]}`);
        }

        // didėjanti pauzė: ~6s, 12s, 18s...
        await randomDelay(attempt * 5000, attempt * 7000);
    }

    return "blocked";
}

interface CategoryState {
    baseUrl: string;
    name: string;
    products: Product[];
    nextPage: number;
    done: boolean;
}

(async () => {
    const startedAt = Date.now();
    console.log(`🚀 Paleidžiama Barbora V3 (lygiagrečiai kategorijų: ${CONCURRENCY})...`);

    const browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    await context.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "font", "media"].includes(resourceType)) route.abort();
        else route.continue();
    });

    const visitedUrls = new Set<string>();

    const dataDir = path.join(__dirname, "data", "barbora");
    fs.mkdirSync(dataDir, { recursive: true });

    const states: CategoryState[] = CATEGORIES.map((baseUrl) => ({
        baseUrl,
        name: baseUrl.split("/").pop() ?? baseUrl,
        products: [],
        nextPage: 1,
        done: false,
    }));

    function saveCategory(state: CategoryState) {
        if (state.products.length === 0) return;
        const file = path.join(dataDir, "barbora_" + state.name + ".json");
        fs.writeFileSync(file, JSON.stringify(state.products, null, 2), "utf-8");
    }

    async function scrapeCategory(state: CategoryState, index: number, attempts: number, pauseMin: number, pauseMax: number) {
        const tag = `[${index + 1}/${states.length}]`;
        console.log(`\n${tag} 🌐 ${state.done ? "Praleidžiama (baigta)" : `Tęsiama: ${state.name} nuo p.${state.nextPage}`}`);
        if (state.done) return;

        const page = await context.newPage();

        try {
            while (true) {
                if (page.isClosed()) break;

                const url = state.nextPage === 1 ? state.baseUrl : `${state.baseUrl}?page=${state.nextPage}`;
                const result = await loadPage(page, url, attempts, tag);

                if (result === "empty" && state.products.length === 0 && state.nextPage === 1) {
                    // kategorija be nė vienos prekės pirmame puslapyje = užblokuota / kitoks puslapis, o ne tikra pabaiga
                    console.log(`${tag} ❌ ${state.name}: pirmas puslapis be prekių – laikoma užblokuota, kategorija NEBAIGTA.`);
                    break;
                }

                if (result === "empty") {
                    console.log(`${tag} 🏁 ${state.name}: puslapis ${state.nextPage} tuščias – kategorija baigta (${state.products.length}).`);
                    state.done = true;
                    break;
                }

                if (result === "blocked") {
                    console.log(`${tag} ❌ ${state.name}: puslapis ${state.nextPage} nepasikrovė – kategorija NEBAIGTA (turim ${state.products.length}).`);
                    break;
                }

                // 1) be scroll'o
                let rawItems = await extractItems(page);

                // 2) jei mažai – scrollinam
                if (rawItems.length < SCROLL_THRESHOLD) {
                    await scrollToBottom(page);
                    await randomDelay(300, 600);
                    rawItems = await extractItems(page);
                }

                let newItemsInPage = 0;

                for (const item of rawItems) {
                    if (item.fullUrl && !visitedUrls.has(item.fullUrl)) {
                        visitedUrls.add(item.fullUrl);
                        newItemsInPage++;

                        const storePrice: StorePrices = {
                            store: "MAXIMA",
                            price: item.price,
                            ...(item.oldPrice !== undefined && { oldPrice: item.oldPrice }),
                            isOnSale: item.isOnSale,
                            measurementUnit: item.unit,
                            url: item.fullUrl,
                        };

                        state.products.push({
                            id: "barbora-" + item.id,
                            name: item.title,
                            description: item.title,
                            prices: [storePrice],
                            imageUrl: item.image,
                        });
                    }
                }

                console.log(`${tag} 📄 ${state.name} p.${state.nextPage}: rasta ${rawItems.length}, naujų ${newItemsInPage}`);

                if (rawItems.length === 0 || newItemsInPage === 0) {
                    console.log(`${tag} 🏁 ${state.name}: daugiau naujų prekių nėra – baigta (${state.products.length}).`);
                    state.done = true;
                    break;
                }

                state.nextPage++;
                await randomDelay(pauseMin, pauseMax);
            }
        } finally {
            if (!page.isClosed()) await page.close().catch(() => {});
            saveCategory(state);
        }
    }

    // ---------- PAGRINDINIS PRAĖJIMAS ----------
    await runPool(states, CONCURRENCY, async (state, i) => {
        try {
            await scrapeCategory(state, i, MAIN_PASS_ATTEMPTS, 600, 1300);
        } catch (e) {
            console.log(`[${i + 1}] 💥 Kategorijos klaida:`, (e as Error).message);
        }
    });

    // ---------- NEBAIGTŲ KARTOJIMAS ----------
    for (let pass = 1; pass <= RETRY_PASSES; pass++) {
        const incomplete = states.filter((s) => !s.done);
        if (incomplete.length === 0) break;

        console.log(
            `\n🔁 Kartojimas ${pass}/${RETRY_PASSES}: nebaigta ${incomplete.length} kategorijų (${incomplete.map((s) => s.name).join(", ")}). Pauzė 30s...`,
        );
        await randomDelay(30000, 35000);

        // kartojam po vieną, lėčiau – kad Cloudflare nebeblokuotų
        for (const state of incomplete) {
            const idx = states.indexOf(state);
            try {
                await scrapeCategory(state, idx, RETRY_PASS_ATTEMPTS, 1500, 2800);
            } catch (e) {
                console.log(`[${idx + 1}] 💥 Kategorijos klaida:`, (e as Error).message);
            }
        }
    }

    await browser.close().catch(() => {});

    // ---------- SUVESTINĖ ----------
    const secs = Math.round((Date.now() - startedAt) / 1000);
    console.log("\n==================== BARBORA SUVESTINĖ ====================");
    let total = 0;
    for (const s of states) {
        total += s.products.length;
        console.log(`${s.done ? "✅" : "⚠️ NEBAIGTA"} ${s.name.padEnd(40)} ${String(s.products.length).padStart(5)} prekių`);
    }
    console.log(`\n🎉 Barbora baigta! Unikalių prekių: ${total} | Trukmė: ${secs}s`);

    if (total === 0) {
        console.log("\n❌ Barbora nesurinko nė vienos prekės (greičiausiai užblokuota). Senų duomenų nekeičiam.");
        process.exitCode = 1;
    }

    const bad = states.filter((s) => !s.done);
    if (bad.length > 0) {
        console.log(`\n⚠️ ${bad.length} kategorijų liko nebaigtos – paleisk dar kartą su: BARBORA_CONCURRENCY=1 npx tsx barbora`);
        process.exitCode = 1;
    }
})();
