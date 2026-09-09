import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { Product, StorePrices } from "../types/products";

chromium.use(stealthPlugin());

(async () => {
    console.log("🚀 Paleidžiama Rimi rinkimo naršyklė (UI paspaudimų metodas)...");

    const browser = await chromium.launch({
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"]
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        locale: "lt-LT",
    });

    const consentDate = new Date().toISOString();
    await context.addCookies([
        {
            name: "CookieConsent",
            value: `{stamp:%271%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2CMarketing:true%2Cmethod:%2Ctimestamp:${encodeURIComponent(consentDate)}%2Cver:1%2Cdomain%3A%27www.rimi.lt%27%2Ccst%3A%27iab%27}`,
            domain: ".rimi.lt",
            path: "/"
        }
    ]);

    const page = await context.newPage();
    const startUrl = "https://www.rimi.lt/e-parduotuve/lt/produktai/vaisiai-darzoves-ir-geles/c/SH-15";
    
    console.log(`\n🌐 Atidaromas pradinis puslapis: ${startUrl}`);
    try {
        await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
        console.log("⚠️ Užkrovimo įspėjimas, tęsiame...");
    }

    let allProducts: Product[] = [];
    const visitedUrls = new Set<string>();
    let pageNum = 1;

    while (true) {
        console.log(`\n📄 Apdorojamas puslapis nr. ${pageNum}...`);

        // Slenkame žemyn, kad tinklelis ir puslapiavimo elementai būtų matomi DOM
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(2000);

        try {
            await page.waitForSelector("li.product-grid__item", { timeout: 10000 });
        } catch (e) {
            console.log("🏁 Produktų tinklelis nerastas – pabaiga.");
            break;
        }

        // Nuskaitome produktus iš esamo vaizdo
        const rawItems = await page.evaluate(() => {
            const items: any[] = [];
            const cards = Array.from(document.querySelectorAll("li.product-grid__item"));

            cards.forEach((card) => {
                const titleEl = card.querySelector(".card__name");
                const title = titleEl ? titleEl.textContent?.trim() : "";
                if (!title) return;

                const linkEl = card.querySelector("a.card__url") as HTMLAnchorElement;
                const href = linkEl ? linkEl.getAttribute("href") : "";
                if (!href) return;
                const fullUrl = href.startsWith("http") ? href : `https://www.rimi.lt${href}`;

                const imgEl = card.querySelector("img.card__image") || card.querySelector("img");
                const imageUrl = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || undefined) : undefined;

                let price = 0;
                let oldPrice: number | undefined = undefined;
                let isOnSale = false;

                const srOnlyEl = card.querySelector(".card__price .sr-only");
                if (srOnlyEl) {
                    const text = srOnlyEl.textContent || "";
                    const match = text.replace(",", ".").match(/(\d+\.\d+|\d+)/);
                    if (match) price = parseFloat(match[0]);
                } else {
                    const euroEl = card.querySelector(".card__price [aria-hidden='true']");
                    const centEl = card.querySelector(".card__price sup");
                    if (euroEl && centEl) {
                        const euro = euroEl.textContent?.trim() || "0";
                        const cent = centEl.textContent?.trim() || "00";
                        price = parseFloat(`${euro}.${cent}`);
                    }
                }

                const oldPriceEl = card.querySelector(".card__old-price, .old-price, .price-badge--discount");
                if (oldPriceEl) {
                    const oldText = oldPriceEl.textContent || "";
                    const oldMatch = oldText.replace(",", ".").match(/(\d+\.\d+|\d+)/);
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
        });

        let newItemsInPage = 0;
        for (const item of rawItems) {
            if (item.fullUrl && !visitedUrls.has(item.fullUrl)) {
                visitedUrls.add(item.fullUrl);
                newItemsInPage++;

                const storePrice: StorePrices = {
                    store: "RIMI",
                    price: item.price,
                    oldPrice: item.oldPrice,
                    isOnSale: item.isOnSale,
                    measurementUnit: item.measurementUnit,
                };

                const productId = `rimi-${Buffer.from(item.fullUrl).toString("base64").substring(0, 15)}`;

                allProducts.push({
                    id: productId,
                    name: item.title,
                    description: item.title,
                    prices: [storePrice],
                    imageUrl: item.imageUrl,
                    url: item.fullUrl,
                });
            }
        }

        console.log(`🔎 Rasta kortelių puslapyje: ${rawItems.length} | Naujų įtraukta: ${newItemsInPage}`);

        // Ieškome ir spaudžiame kitą puslapį (rodytuvę / rodyklę "Toliau")
        // Rimi puslapyje kitas puslapis dažniausiai yra rodyklė su klasę arba pasiekiama per pagination mygtukus
        const nextArrow = page.locator('a.pagination__item--arrow:not(.pagination__item--disabled), [aria-label="Next page"], .pagination li:last-child a').last();
        
        // Alternatyviai ieškome tiesiog kito skaičiaus mygtuko (pvz. pageNum + 1)
        const nextNumberBtn = page.locator(`a.pagination__item:text("${pageNum + 1}")`);

        let clicked = false;
        try {
            if (await nextNumberBtn.count() > 0 && await nextNumberBtn.isVisible()) {
                console.log(`➡️ Spaudžiamas puslapio numeris: ${pageNum + 1}`);
                await nextNumberBtn.click();
                clicked = true;
            } else if (await nextArrow.count() > 0 && await nextArrow.isVisible()) {
                console.log("➡️ Spaudžiama puslapio rodyklė 'Toliau'...");
                await nextArrow.click();
                clicked = true;
            }
        } catch (e) {
            console.log("ℹ️ Nepavyko paspausti puslapio mygtuko.");
        }

        if (!clicked || newItemsInPage === 0) {
            console.log("🏁 Daugiau puslapių nebėra arba mygtukas nepasiekiamas.");
            break;
        }

        pageNum++;
        // Palaukiame kol atsinaujins prekių tinklelis po paspaudimo
        await page.waitForTimeout(3000);
    }

    if (allProducts.length > 0) {
        const dataDir = path.resolve(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const filePath = path.join(dataDir, "rimi.json");
        fs.writeFileSync(filePath, JSON.stringify(allProducts, null, 2), "utf-8");
        console.log(`\n🎉 VISO sėkmingai išsaugota ${allProducts.length} Rimi produktų į:\n${filePath}`);
    } else {
        console.log("⚠️ Nerasta jokių produktų.");
    }

    if (!page.isClosed()) {
        await browser.close().catch(() => {});
    }
})();