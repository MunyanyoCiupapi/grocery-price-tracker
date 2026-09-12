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
    "https://barbora.lt/darzoves-ir-vaisiai",
    "https://barbora.lt/pieno-gaminiai-kiausiniai-ir-majonezas",
    "https://barbora.lt/duonos-gaminiai-ir-konditerija",
    "https://barbora.lt/mesa-zuvis-ir-kulinarija",
    "https://barbora.lt/bakaleja",
    "https://barbora.lt/saldytas-maistas",
    "https://barbora.lt/gerimai",
    "https://barbora.lt/kudikiu-ir-vaiku-prekes",
    "https://barbora.lt/kosmetika-ir-higiena",
    "https://barbora.lt/svaros-ir-gyvunu-prekes",
    "https://barbora.lt/namai-ir-laisvalaikis",
];

const randomDelay = (min: number, max: number) => 
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

(async () => {
    console.log("🚀 Paleidžiama maksimaliai optimizuota Barbora naršyklė...");

    const browser = await chromium.launch({
        headless: true,
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    const page = await context.newPage();

    await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
            route.abort();
        } else {
            route.continue();
        }
    });

    const visitedUrls = new Set();
    
    const dataDir = path.join(__dirname, "data", "barbora");
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
                await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 50000 });
                loaded = true;
                break;
            } catch (e) {
                console.log("⚠️ Bandymas " + attempt + "/3 nepavyko atidaryti " + baseUrl + ". Bandoma iš naujo...");
                await randomDelay(2000, 3000);
            }
        }

        if (!loaded) {
            console.log("❌ Nepavyko pasiekti kategorijos per 3 kartus, praleidžiama.");
            continue;
        }

        while (true) {
            if (page.isClosed()) {
                console.log("⚠️ Puslapis uždarytas.");
                break;
            }

            console.log("\n📄 Apdorojamas puslapis nr. " + currentPage + "...");

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

            await randomDelay(400, 800);

            const selectorLoaded = await page.waitForSelector("li[data-testid^='product-card']", { timeout: 12000 }).catch(() => false);
            if (!selectorLoaded) {
                console.log("⚠️ Produktų kortelės nepasikrovė arba puslapis tuščias. Baigiamas šios kategorijos skrapinimas.");
                break;
            }

            const rawItems = await page.evaluate(() => {
                const items: any[] = [];
                const cardElements = Array.from(document.querySelectorAll("li[data-testid^='product-card']"));

                cardElements.forEach((card) => {
                    const htmlCard = card as HTMLElement;
                    const cardText = htmlCard.innerText || htmlCard.textContent || "";

                    const isOutOfStock =
                        card.querySelector("[data-testid='out-of-stock-button']") !== null ||
                        cardText.includes("Atsiprašome, šiuo metu prekės neturime") ||
                        cardText.includes("Išparduota");

                    if (isOutOfStock) return;

                    const placeholder = card.querySelector("div[data-b-for-cart]");
                    const rawJson = placeholder?.getAttribute("data-b-for-cart");
                    if (!rawJson) return;

                    try {
                        const data = JSON.parse(rawJson);
                        if (data.status === "suspended" || !data.price || data.price <= 0) return;

                        const currentPrice = Number(data.price);
                        let oldPrice: number | undefined = undefined;

                        if (data.promotion?.oldPrice && Number(data.promotion.oldPrice) > currentPrice) {
                            oldPrice = Number(data.promotion.oldPrice);
                        } else if (data.retail_price && Number(data.retail_price) > currentPrice) {
                            oldPrice = Number(data.retail_price);
                        }

                        const linkEl = card.querySelector("a[href*='/produktai/']") as HTMLAnchorElement;
                        let relativeUrl = linkEl ? linkEl.getAttribute("href") : "";
                        if (!relativeUrl && data.Url) {
                            relativeUrl = "/produktai/" + data.Url;
                        }
                        const fullUrl = relativeUrl ? (relativeUrl.startsWith("http") ? relativeUrl : "https://barbora.lt" + relativeUrl) : "";

                        items.push({
                            id: data.id || data.item_id,
                            title: data.title,
                            price: currentPrice,
                            oldPrice: oldPrice,
                            isOnSale: oldPrice !== undefined,
                            unit: data.comparative_unit || "vnt.",
                            image: data.big_image || data.image || undefined,
                            fullUrl: fullUrl,
                        });
                    } catch (e) {}
                });
                return items;
            }).catch(() => []);

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

                    categoryProducts.push({
                        id: "barbora-" + item.id,
                        name: item.title,
                        description: item.title,
                        prices: [storePrice],
                        imageUrl: item.image,
                    });
                }
            }

            console.log("🔎 Puslapyje rasta: " + rawItems.length + " | Naujų įtraukta: " + newItemsInPage);

            if (newItemsInPage === 0 || rawItems.length === 0) {
                console.log("🏁 Šioje kategorijoje daugiau puslapių nėra arba prekės baigėsi.");
                break;
            }

            currentPage++;
            const nextUrl = baseUrl + "?page=" + currentPage;
            console.log("➡️ Einama į puslapį nr. " + currentPage + "...");

            let nextLoaded = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 50000 });
                    await randomDelay(2000, 3500);
                    
                    const checkCards = await page.waitForSelector("li[data-testid^='product-card']", { timeout: 8000 }).catch(() => false);
                    if (checkCards) {
                        nextLoaded = true;
                        break;
                    }
                } catch (e) {
                    console.log("⚠️ Nepavyko atidaryti puslapio " + currentPage + " (bandymas " + attempt + "/3). Bandoma iš naujo...");
                    await randomDelay(4000, 6000);
                }
            }

            if (!nextLoaded) {
                console.log("⚠️ Puslapio nepavyko pasiekti po 3 bandymų, baigiama ši kategorija.");
                break;
            }
        }

        if (categoryProducts.length > 0) {
            const catName = baseUrl.split("/").pop();
            const catFilePath = path.join(dataDir, "barbora_" + catName + ".json");
            fs.writeFileSync(catFilePath, JSON.stringify(categoryProducts, null, 2), "utf-8");
            console.log("💾 Kategorijos duomenys išsaugoti į data/barbora/barbora_" + catName + ".json (Viso: " + categoryProducts.length + ")");
        }
    }

    if (!page.isClosed()) {
        await browser.close().catch(() => {});
    }
    console.log("\n🎉 Visų kategorijų skrapinimas baigtas! Iš viso unikalių prekių: " + visitedUrls.size);
})();