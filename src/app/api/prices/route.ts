import { NextResponse } from "next/server";
import { Product, StorePrices } from "@/types/products";
import fs from "fs";
import path from "path";

let cachedProducts: Product[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 1000 * 60 * 15; // 15 minučių

function loadAndAggregateProducts(): Product[] {
    const dataDir = path.join(process.cwd(), "src", "scrapers", "data");
    if (!fs.existsSync(dataDir)) return [];

    const getJsonFiles = (dir: string): string[] => {
        let results: string[] = [];
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of list) {
            const resPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                results = results.concat(getJsonFiles(resPath));
            } else if (file.name.endsWith(".json")) {
                results.push(resPath);
            }
        }
        return results;
    };

    const files = getJsonFiles(dataDir);
    const productMap = new Map();
    let counter = 1;

    for (const filePath of files) {
        try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const products: Product[] = JSON.parse(fileContent);

            for (const p of products) {
                let normalizedKey = p.name
                    .toLowerCase()
                    .replace(/\b(kilmės šalis|ispanija|lenkija|lietuva|italija|olandija|belgija|estija|latvija)\b/gi, "")
                    .replace(/\b(traškūs|bulvių|bulv|krekeriai|gimtoji|gaminys|sūrio|skonio)\b/gi, "")
                    .replace(/\d+\s*(g|kg|ml|l|vnt\.?)\b/gi, "")
                    .replace(/[^\wąčęėįšųūž\s]/gi, "")
                    .replace(/\s+/g, " ")
                    .trim();

                if (normalizedKey.length < 3) {
                    normalizedKey = p.name.toLowerCase().trim();
                }

                if (productMap.has(normalizedKey)) {
                    const existing = productMap.get(normalizedKey)!;
                    for (const newPrice of p.prices) {
                        if (!existing.prices.some((sp: StorePrices) => sp.store === newPrice.store)) {
                            existing.prices.push(newPrice);
                        }
                    }
                } else {
                    const uniqueId = `prod-${counter++}`;
                    productMap.set(normalizedKey, {
                        ...p,
                        id: uniqueId,
                    });
                }
            }
        } catch (e) {
            console.error(`Klaida skaitant failą ${filePath}:`, e);
        }
    }

    return Array.from(productMap.values());
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "24", 10);
        const search = searchParams.get("q")?.toLowerCase().trim() || "";

        const now = Date.now();
        if (!cachedProducts || now - lastCacheTime > CACHE_TTL) {
            cachedProducts = loadAndAggregateProducts();
            lastCacheTime = now;
        }

        let filtered = cachedProducts;
        if (search) {
            filtered = cachedProducts.filter((p) =>
                p.name.toLowerCase().includes(search)
            );
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const paginatedProducts = filtered.slice(startIndex, startIndex + limit);

        return NextResponse.json(
            {
                products: paginatedProducts,
                pagination: {
                    total,
                    page,
                    totalPages,
                    limit,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Klaida skaitant prekių duomenis:", error);
        return NextResponse.json(
            { error: "Nepavyko užkrauti produktų" },
            { status: 500 }
        );
    }
}