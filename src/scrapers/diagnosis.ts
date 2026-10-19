
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "data");
const seenIds = new Map<string, string>();
const stats = new Map<string, {
  files: number;
  products: number;
  valid: number;
  missingId: number;
  missingName: number;
  missingPrice: number;
  missingUrl: number;
  duplicateId: number;
}>();

function scan(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory()
      ? scan(p)
      : entry.name.endsWith(".json") ? [p] : [];
  });
}

for (const file of scan(root)) {
  let products: any[];

  try {
    products = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.log("BLOGAS JSON:", file);
    continue;
  }

  if (!Array.isArray(products)) continue;

  const relative = path.relative(root, file);
  const storeFromFile = relative.split(path.sep)[0].toUpperCase();
  const s = stats.get(storeFromFile) ?? {
    files: 0, products: 0, valid: 0,
    missingId: 0, missingName: 0,
    missingPrice: 0, missingUrl: 0, duplicateId: 0,
  };

  s.files++;
  s.products += products.length;

  for (const p of products) {
    const price = p.prices?.[0];
    let valid = true;

    if (!p.id) { s.missingId++; valid = false; }
    if (!p.name) { s.missingName++; valid = false; }
    if (!price || typeof price.price !== "number" || price.price <= 0) {
      s.missingPrice++;
      valid = false;
    }
    if (!price?.url) { s.missingUrl++; valid = false; }

    if (p.id) {
      const previous = seenIds.get(p.id);
      if (previous) {
        s.duplicateId++;
        if (!previous.includes(storeFromFile)) {
          console.log(`ID KONFLIKTAS: ${p.id}`);
          console.log(`  Pirmas: ${previous}`);
          console.log(`  Kitas:  ${relative}`);
        }
      } else {
        seenIds.set(p.id, `${storeFromFile}: ${relative}`);
      }
    }

    if (valid) s.valid++;
  }

  stats.set(storeFromFile, s);
}

console.table(Object.fromEntries(stats));
console.log("Unikalių ID visame kataloge:", seenIds.size);
