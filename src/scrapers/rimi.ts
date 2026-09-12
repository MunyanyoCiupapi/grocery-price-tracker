import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product, StorePrices } from "../types/products";

chromium.use(stealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    "https://www.rimi.lt/e-parduotuve/lt/produktai/-honest-bite-prekiu-krautuvele/c/SH-30"
];

const randomDelay = (min: number, max: number) => 
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

(async () => {
    console.log("🚀 Paleidžiama Rimi skripto versija...");

    const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    const page = await context.newPage();
    const visitedUrls = new Set();
    
    const dataDir = path.join(__dirname, "data", "rimi");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    for (const baseUrl of CATEGORIES) {
        console.log("\n========================================");
        console.log("🌐 Pradedama kategorija: " + baseUrl);
        console.log("========================================");

        let currentPage = 1;
        let categoryProducts: Product[] = [];

        let loaded = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
                loaded = true;
                break;
            } catch (e) {
                console.log("⚠️ Bandymas " + attempt + "/3 nepavyko atidaryti " + baseUrl);
                await randomDelay(3000, 5000);
            }
        }

        if (!loaded) {
            console.log("❌ Nepavyko pasiekti kategorijos, praleidžiama.");
            continue;
        }

        try {
            const cookieBtn = await page.$("#onetrust-accept-btn-handler, button[id*='accept']");
            if (cookieBtn) {
                await cookieBtn.click();
                await randomDelay(1000, 1500);
            }
        } catch (err) {}

        while (true) {
            if (page.isClosed()) break;

            console.log("\n📄 Skrapinamas puslapis nr. " + currentPage + "...");

            await page.evaluate(async () => {
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
            }).catch(() => {});

            await randomDelay(1000, 1500);

            const selectorLoaded = await page.waitForSelector("li.product-grid__item", { timeout: 15000 }).catch(() => false);
            if (!selectorLoaded) {
                console.log("⚠️ Produktų nerasta.");
                break;
            }

            const rawItems = await page.evaluate(() => {
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
                    const imageUrl = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || undefined) : undefined;

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
            }).catch(() => []);

            if (rawItems.length === 0) {
                console.log("🏁 Puslapis tuščias, baigiama kategorija.");
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

                    const productId = "rimi-" + Buffer.from(item.fullUrl).toString("base64").replace(/[/+=]/g, "").substring(0, 20);

                    categoryProducts.push({
                        id: productId,
                        name: item.title,
                        description: item.title,
                        prices: [storePrice],
                        imageUrl: item.imageUrl,
                    });
                }
            }

            console.log("🔎 Puslapyje rasta: " + rawItems.length + " | Naujų įtraukta: " + newItemsInPage);

            if (newItemsInPage === 0) {
                console.log("🏁 Nerasta naujų prekių (pasiektas kartojimasis), stabdoma.");
                break;
            }

            const hasNext = await page.evaluate(() => {
                const btn = document.querySelector(".pagination__item--next, [rel='next']") as HTMLElement;
                if (!btn) return false;
                const parentLi = btn.closest("li");
                if (parentLi && parentLi.classList.contains("disabled")) return false;
                return true;
            }).catch(() => false);

            if (!hasNext) {
                console.log("🏁 Pasiektas paskutinis puslapis.");
                break;
            }

            const navigated = await page.evaluate(() => {
                const nextEl = document.querySelector(".pagination__item--next a, [rel='next']") as HTMLElement;
                if (nextEl) {
                    nextEl.click();
                    return true;
                }
                return false;
            }).catch(() => false);

            if (!navigated) {
                console.log("🏁 Nepavyko paspausti sekančio puslapio mygtuko.");
                break;
            }

            currentPage++;
            await randomDelay(3000, 4000);
        }

        if (categoryProducts.length > 0) {
            const urlPathObj = new URL(baseUrl);
            let pathSegments = urlPathObj.pathname.split("/").filter(Boolean);
            
            if (pathSegments.includes("c")) {
                const cIndex = pathSegments.indexOf("c");
                pathSegments = pathSegments.slice(0, cIndex);
            }

            pathSegments = pathSegments.filter(seg => seg !== "e-parduotuve" && seg !== "lt" && seg !== "produktai");

            const categorySlug = pathSegments
                .map(seg => seg.replace(/^-+|-+$/g, ""))
                .filter(Boolean)
                .join("_") || "kategorija";

            const fileName = "rimi_" + categorySlug + ".json";
            const catFilePath = path.join(dataDir, fileName);
            fs.writeFileSync(catFilePath, JSON.stringify(categoryProducts, null, 2), "utf-8");
            console.log("💾 Išsaugota: data/rimi/" + fileName + " (Viso: " + categoryProducts.length + ")");
        }
    }

    if (!page.isClosed()) {
        await browser.close().catch(() => {});
    }
    console.log("\n🎉 Baigta!");
})();