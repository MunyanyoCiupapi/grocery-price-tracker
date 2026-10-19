import { Pool } from "pg";

/**
 * Vienas bendras Postgres connection pool (naudojamas /api/prices).
 * Reikia DATABASE_URL aplinkos kintamojo (.env.local, o Vercel – Project Settings -> Environment Variables).
 */

const globalForPg = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
    if (globalForPg.__pgPool) return globalForPg.__pgPool;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("Trūksta DATABASE_URL (įrašyk į .env.local ir perkrauk `npm run dev`).");
    }

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30_000,
    });

    globalForPg.__pgPool = pool;
    return pool;
}