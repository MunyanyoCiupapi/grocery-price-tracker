import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { Product, StorePrices } from "../types/products";

chromium.use(stealthPlugin());

(async () => {
    console.log("🚀 Paleidžiama stealth naršyklė...");

    const browser = await chromium.launch({
        headless: false,
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    const page = await context.newPage();

    const baseUrl = "https://barbora.lt/darzoves-ir-vaisiai";
    let currentPage = 1;
    let allProducts: Product[] = [];
    const visitedUrls = new Set<string>();

    console.log(`🌐 Naviguojama į kategoriją: ${baseUrl}`);
    try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) { }

    await page.waitForTimeout(2000);
    try {
        const cookieBtn = page.locator("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
        if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await cookieBtn.click({ force: true }).catch(() => { });
            console.log("✅ Slapukai patvirtinti.");
        }
    } catch (e) { }

    while (true) {
        if (page.isClosed()) {
            console.log("⚠️ Puslapis buvo uždarytas, baigiamas skrapinimas.");
            break;
        }

        console.log(`\n📄 Apdorojamas puslapis nr. ${currentPage}...`);

        await page
            .evaluate(() => {
                const ids = ["CybotCookiebotDialog", "CybotCookiebotDialogBodyUnderlay"];
                ids.forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.remove();
                });
            })
            .catch(() => { });

        // Švelnus skrolinimas, kad užsikrautų visi produktai (lazy load)
        await page
            .evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 400;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight - window.innerHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 80);
                });
            })
            .catch(() => { });

        await page.waitForTimeout(1000).catch(() => { });
        await page.waitForSelector("li[data-testid^='product-card']", { timeout: 15000 }).catch(() => { });

        const rawItems = await page
            .evaluate(() => {
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

                    // Pasiimame JSON iš data-b-for-cart atributo
                    const placeholder = card.querySelector("div[data-b-for-cart]");
                    const rawJson = placeholder?.getAttribute("data-b-for-cart");

                    if (!rawJson) return;

                    try {
                        const data = JSON.parse(rawJson);

                        if (data.status === "suspended" || !data.price || data.price <= 0) {
                            return;
                        }

                        const currentPrice = Number(data.price);

                        // Senosios kainos paieška
                        let oldPrice: number | undefined = undefined;

                        if (data.promotion?.oldPrice && Number(data.promotion.oldPrice) > currentPrice) {
                            oldPrice = Number(data.promotion.oldPrice);
                        } else if (data.retail_price && Number(data.retail_price) > currentPrice) {
                            oldPrice = Number(data.retail_price);
                        } else {
                            const crossedEl = card.querySelector(".text-neutral-500, .line-through, [class*='line-through']");
                            if (crossedEl) {
                                const txt = (crossedEl.textContent || "").replace(/[^0-9,.]/g, "").replace(",", ".");
                                const parsedTxt = parseFloat(txt);
                                if (!isNaN(parsedTxt) && parsedTxt > currentPrice) {
                                    oldPrice = parsedTxt;
                                }
                            }
                        }

                        const isOnSale = oldPrice !== undefined;

                        // Tikrasis URL ištraukimas iš kortelėje esančios nuorodos arba JSON duomenų
                        const linkEl = card.querySelector("a[href*='/produktai/']") as HTMLAnchorElement;
                        let relativeUrl = linkEl ? linkEl.getAttribute("href") : "";
                        if (!relativeUrl && data.Url) {
                            relativeUrl = `/produktai/${data.Url}`;
                        }
                        const fullUrl = relativeUrl ? (relativeUrl.startsWith("http") ? relativeUrl : `https://barbora.lt${relativeUrl}`) : "";

                        items.push({
                            id: data.id || data.item_id,
                            title: data.title,
                            price: currentPrice,
                            oldPrice: oldPrice,
                            isOnSale: isOnSale,
                            unit: data.comparative_unit || "vnt.",
                            image: data.big_image || data.image || undefined,
                            fullUrl: fullUrl,
                        });
                    } catch (e) { }
                });

                return items;
            })
            .catch(() => []);

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
                };

                const product: Product = {
                    id: `barbora-${item.id}`,
                    name: item.title,
                    description: item.title,
                    prices: [storePrice],
                    imageUrl: item.image,
                    url: item.fullUrl, // <-- Čia įrašomas produkto URL
                };

                allProducts.push(product);
            }
        }

        console.log(
            `🔎 Puslapyje nr. ${currentPage} rasta galiojančių produktų: ${rawItems.length} (Naujų pridėta: ${newItemsInPage})`
        );

        if (newItemsInPage === 0) {
            console.log("🏁 Naujų galiojančių produktų nerasta, skrapinimas baigtas!");
            break;
        }

        currentPage++;
        const nextUrl = `${baseUrl}?page=${currentPage}`;
        console.log(`➡️ Einama į puslapį nr. ${currentPage}: ${nextUrl}`);

        try {
            await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(1500);
        } catch (e) {
            console.log("⚠️ Nepavyko užkrauti kito puslapio, baigiama.");
            break;
        }
    }

    if (allProducts.length > 0) {
        const dataDir = path.resolve(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const filePath = path.join(dataDir, "barbora.json");
        fs.writeFileSync(filePath, JSON.stringify(allProducts, null, 2), "utf-8");

        console.log(`\n🎉 VISO išsaugota ${allProducts.length} produktų į:\n${filePath}`);
    }

    if (!page.isClosed()) {
        await browser.close().catch(() => { });
    }
})();