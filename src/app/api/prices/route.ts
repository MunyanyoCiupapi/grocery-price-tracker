import { NextResponse } from "next/server";
import { Product } from "@/types/products";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), "src", "scrapers", "data");

        if (!fs.existsSync(dataDir)) {
            return NextResponse.json([], { status: 200 });
        }

        const files = fs.readdirSync(dataDir).filter((file) => file.endsWith(".json"));
        const productMap = new Map<string, Product>();
        let counter = 1;

        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const products: Product[] = JSON.parse(fileContent);

            for (const p of products) {
                let normalizedKey = p.name
                    .toLowerCase()
                    .replace(/\b(kilmės šalis|ispanija|lenkija|lietuva|italija|olandija|belgija)\b/gi, "")
                    .replace(/\d+\s*(g|kg|ml|l|vnt\.?)\b/gi, "")
                    .replace(/[^\wąčęėįšųūž\s]/gi, "")
                    .replace(/\s+/g, " ")
                    .trim();

                if (normalizedKey.length < 3) {
                    normalizedKey = p.name.toLowerCase().trim();
                }

                // Priskiriame parduotuvės specifinį URL ir nuotrauką prie kainos objekto
                const enrichedPrices = p.prices.map((priceItem) => ({
                    ...priceItem,
                    url: p.url,
                    imageUrl: p.imageUrl,
                }));

                if (productMap.has(normalizedKey)) {
                    const existing = productMap.get(normalizedKey)!;
                    
                    for (const newPrice of enrichedPrices) {
                        if (!existing.prices.some((sp: any) => sp.store === newPrice.store)) {
                            existing.prices.push(newPrice);
                        }
                    }

                    if (!existing.imageUrl && p.imageUrl) {
                        existing.imageUrl = p.imageUrl;
                    }
                } else {
                    const uniqueId = `prod-${counter++}`;
                    productMap.set(normalizedKey, {
                        ...p,
                        prices: enrichedPrices,
                        id: uniqueId,
                    });
                }
            }
        }

        const mergedProducts = Array.from(productMap.values());
        return NextResponse.json(mergedProducts, { status: 200 });
    } catch (error) {
        console.error("Klaida skaitant prekių duomenis:", error);
        return NextResponse.json(
            { error: "Nepavyko užkrauti produktų" },
            { status: 500 }
        );
    }
}