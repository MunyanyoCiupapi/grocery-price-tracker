import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Paleidžia visus scraperius VIENU METU kaip atskirus procesus.
 *
 *   npx tsx src/scrapers/run-all.ts                 (visi)
 *   npx tsx src/scrapers/run-all.ts iki lidl        (tik pasirinkti)
 *
 * Gali pasirodyti, kad vienas nepavyko – kiti vistiek išsaugo savo failus.
 * Pabaigoje išvedama suvestinė, o jei bent vienas krito, exit code = 1.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL = ["iki", "lidl", "rimi", "barbora"] as const;

const requested = process.argv.slice(2).map((s) => s.toLowerCase());
const targets = requested.length > 0 ? ALL.filter((name) => requested.includes(name)) : [...ALL];

if (targets.length === 0) {
    console.error(`Nežinomi scraperiai: ${requested.join(", ")}. Galimi: ${ALL.join(", ")}`);
    process.exit(1);
}

interface Result {
    name: string;
    code: number;
    seconds: number;
}

function runScraper(name: string): Promise<Result> {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const file = path.join(__dirname, `${name}.ts`);

        const child = spawn("npx", ["tsx", `"${file}"`], {
            shell: true,
            env: process.env,
        });

        const prefix = `[${name.toUpperCase().padEnd(7)}] `;
        const forward = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) => {
            let buffer = "";
            stream.on("data", (chunk: Buffer) => {
                buffer += chunk.toString("utf-8");
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.trim()) out.write(prefix + line + "\n");
                }
            });
            stream.on("end", () => {
                if (buffer.trim()) out.write(prefix + buffer + "\n");
            });
        };

        forward(child.stdout, process.stdout);
        forward(child.stderr, process.stderr);

        child.on("close", (code) => {
            resolve({ name, code: code ?? 1, seconds: Math.round((Date.now() - startedAt) / 1000) });
        });
        child.on("error", () => {
            resolve({ name, code: 1, seconds: Math.round((Date.now() - startedAt) / 1000) });
        });
    });
}

(async () => {
    const startedAt = Date.now();
    console.log(`🚀 Paleidžiami scraperiai lygiagrečiai: ${targets.join(", ")}\n`);

    const results = await Promise.all(targets.map(runScraper));

    console.log("\n==================== SUVESTINĖ ====================");
    for (const r of results) {
        console.log(`${r.code === 0 ? "✅" : "❌"} ${r.name.padEnd(8)} ${r.seconds}s${r.code === 0 ? "" : ` (exit ${r.code})`}`);
    }
    console.log(`Bendra trukmė: ${Math.round((Date.now() - startedAt) / 1000)}s`);

    if (results.some((r) => r.code !== 0)) process.exitCode = 1;
})();