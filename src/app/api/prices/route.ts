
import { NextResponse } from "next/server";
import type { Product, StorePrices } from "@/types/products";
import fs from "fs";
import path from "path";

let cachedProducts: Product[] | null = null;
let lastCacheTime = 0;

const CACHE_TTL = 1000 * 60 * 15;

// Pašalinami tik požymiai, kurie paprastai nereiškia kito produkto.
function normalizeProductName(name: string): string {
    let value = String(name ?? "")
        .normalize("NFC")
        .toLocaleLowerCase("lt-LT")
        .replace(/&nbsp;|&#x20;|&#x20/gi, " ")
        .replace(/&#x27;|&#39;/gi, "'")
        .replace(/&amp;/gi, "&");

    // Žinomų to paties produkto pavadinimų variantai.
    // Monster Ultra White ir Monster Zero Ultra – tas pats gėrimas.
    value = value
        .replace(/\bmonster\s+ultra\s+white\b/gi, "monster zero ultra")
        .replace(/\bmonster\s+white\s+ultra\b/gi, "monster zero ultra");

    // Pašaliname kilmės informaciją, kai ji įrašyta pavadinime.
    value = value.replace(
        /\b(kilmės šalis|ispanija|lenkija|lietuva|italija|olandija|belgija|estija|latvija)\b/gi,
        " "
    );

    // Pašaliname dydžius, pvz. 75-85 mm, 75 x 85 mm.
    value = value.replace(
        /\b\d+(?:[.,]\d+)?\s*(?:-|–|—|x|×)\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)\b/gi,
        " "
    );

    // Pašaliname kiekius: 1 kg, 500 ml, 1,5 l, 300 g ir pan.
    value = value.replace(
        /\b\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|cl|l|lit(?:rų|rai|ras)?|vnt\.?|vienet(?:ų|ai)?)\b/gi,
        " "
    );

    // Pašaliname papildomus pakuotės kiekių užrašus: 6 x 500 ml.
    value = value.replace(
        /\b\d+\s*(?:vnt\.?|vnt|x|×|pak\.)\b/gi,
        " "
    );

    // Kai kurie pardavėjai prideda reklaminę informaciją.
    value = value.replace(
        /\b(?:akcija|speciali kaina|riboto leidimo)\b/gi,
        " "
    );

    // Suvienodiname skyrybą ir tarpus, bet paliekame lietuviškas raides.
    value = value
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

    return value;
}

function loadAndAggregateProducts(): Product[] {
    const dataDir = path.join(
        process.cwd(),
        "src",
        "scrapers",
        "data"
    );

    if (!fs.existsSync(dataDir)) {
        console.warn("Produktų katalogas nerastas:", dataDir);
        return [];
    }

    const getJsonFiles = (dir: string): string[] => {
        const results: string[] = [];

        for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
                results.push(...getJsonFiles(fullPath));
            } else if (file.isFile() && file.name.endsWith(".json")) {
                results.push(fullPath);
            }
        }

        return results;
    };

    const productMap = new Map<string, Product>();
    let counter = 1;

    for (const filePath of getJsonFiles(dataDir)) {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const parsed: unknown = JSON.parse(content);

            if (!Array.isArray(parsed)) {
                console.warn("Praleistas netinkamas JSON:", filePath);
                continue;
            }

            const products = parsed as Product[];

            for (const p of products) {
                if (
                    !p ||
                    typeof p.name !== "string" ||
                    !p.name.trim() ||
                    !Array.isArray(p.prices)
                ) {
                    continue;
                }

                const normalizedKey = normalizeProductName(p.name);

                // Per trumpi pavadinimai pernelyg nepatikimi sutapatinimui.
                const key =
                    normalizedKey.length >= 3
                        ? normalizedKey
                        : `original:${p.name.toLocaleLowerCase("lt-LT").trim()}`;

                const existing = productMap.get(key);

                if (existing) {
                    for (const newPrice of p.prices) {
                        const sameStore = existing.prices.some(
                            (price: StorePrices) =>
                                price.store === newPrice.store
                        );

                        if (!sameStore) {
                            existing.prices.push(newPrice);
                        }
                    }
                } else {
                    productMap.set(key, {
                        ...p,
                        id: `prod-${counter++}`,
                        prices: [...p.prices],
                    });
                }
            }
        } catch (error) {
            console.error(`Klaida skaitant failą ${filePath}:`, error);
        }
    }

    return Array.from(productMap.values());
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const rawPage = Number(searchParams.get("page") ?? 1);
        const rawLimit = Number(searchParams.get("limit") ?? 24);

        const page = Number.isFinite(rawPage)
            ? Math.max(1, Math.floor(rawPage))
            : 1;

        const limit = Number.isFinite(rawLimit)
            ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
            : 24;

        const search = (searchParams.get("q") ?? "")
            .toLocaleLowerCase("lt-LT")
            .trim();

        const now = Date.now();

        if (!cachedProducts || now - lastCacheTime > CACHE_TTL) {
            cachedProducts = loadAndAggregateProducts();
            lastCacheTime = now;
        }

        const filtered = search
            ? cachedProducts.filter((product) =>
                  product.name
                      .toLocaleLowerCase("lt-LT")
                      .includes(search)
              )
            : cachedProducts;

        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;

        const products = filtered.slice(
            startIndex,
            startIndex + limit
        );

        return NextResponse.json(
            {
                products,
                pagination: {
                    total,
                    page,
                    totalPages,
                    limit,
                },
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("Klaida skaitant prekių duomenis:", error);

        return NextResponse.json(
            { error: "Nepavyko užkrauti produktų" },
            { status: 500 }
        );
    }
}
