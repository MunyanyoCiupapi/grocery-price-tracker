"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Product, StorePrices } from "@/types/products";

interface PaginationInfo {
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

type ProductWithKey = Product & { groupKey: string };

interface CartLine {
  name: string;
  imageUrl?: string;
  qty: number;
}
type Cart = Record<string, CartLine>;

interface Offer {
  name: string;
  price: number;
  oldPrice?: number;
  isOnSale: boolean;
  url: string;
}
type Offers = Record<string, Record<string, Offer>>;

const CART_STORAGE_KEY = "kainu-agregatorius-cart-v1";

const STORE_LABELS: Record<string, string> = {
  RIMI: "Rimi",
  MAXIMA: "Maxima",
  IKI: "IKI",
  LIDL: "Lidl",
  NORFA: "Norfa",
};
const STORE_COLORS: Record<string, string> = {
  RIMI: "#e11d48",
  MAXIMA: "#2563eb",
  IKI: "#f97316",
  LIDL: "#eab308",
  NORFA: "#16a34a",
};
const ALL_STORES = ["RIMI", "MAXIMA", "IKI", "LIDL"];
const storeLabel = (s: string) => STORE_LABELS[s] ?? s;
const storeColor = (s: string) => STORE_COLORS[s] ?? "#64748b";

const eur = (n: number) =>
  new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(n);

function StoreDot({ store }: { store: string }) {
  return (
    <span
      aria-hidden
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: storeColor(store) }}
    />
  );
}

interface StoreTotal {
  store: string;
  total: number;
  missing: string[];
  complete: boolean;
}

/**
 * Kiekvienai parduotuvei: visos krepšelio sumos, kiek prekių trūksta.
 * Rekomenduojama viena parduotuvė: pigiausia iš tų, kurios turi VISAS prekes;
 * jei tokios nėra – ta, kuriai trūksta mažiausiai prekių (tada pigiausia).
 */
function computeTotals(cart: Cart, offers: Offers) {
  const keys = Object.keys(cart);
  const stores = [...new Set([...ALL_STORES, ...keys.flatMap((k) => Object.keys(offers[k] ?? {}))])];

  const perStore: StoreTotal[] = stores.map((store) => {
    let total = 0;
    const missing: string[] = [];
    for (const k of keys) {
      const offer = offers[k]?.[store];
      if (offer) total += offer.price * cart[k].qty;
      else missing.push(cart[k].name);
    }
    return { store, total, missing, complete: missing.length === 0 };
  });

  perStore.sort(
    (a, b) => a.missing.length - b.missing.length || a.total - b.total,
  );

  const best = perStore.find((st) => st.missing.length < keys.length);
  const completeStores = perStore.filter((s) => s.complete);
  const worstComplete = completeStores.length > 1 ? completeStores[completeStores.length - 1] : undefined;
  const saving = best?.complete && worstComplete ? worstComplete.total - best.total : 0;
  const nobodyHasAll = !!best && !best.complete;

  return { perStore, best, worstComplete, saving, nobodyHasAll };
}

export default function Home() {
  const [products, setProducts] = useState<ProductWithKey[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 24,
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [compareOnly, setCompareOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // krepšelis
  const [cart, setCart] = useState<Cart>({});
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [offers, setOffers] = useState<Offers>({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  const fetchProducts = useCallback(async (page: number, query: string, compare: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/prices?page=${page}&limit=24&q=${encodeURIComponent(query)}${compare ? "&compare=1" : ""}`,
      );
      if (!res.ok) throw new Error("Failed to fetch products");

      const data = await res.json();
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klaida įvyko");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1, searchQuery, compareOnly);
    }, 300); // Debounce paieškai

    return () => clearTimeout(timer);
  }, [searchQuery, compareOnly, fetchProducts]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(newPage, searchQuery, compareOnly);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // krepšelis nuskaitomas tik naršyklėje po pirmo atvaizdavimo (kad nesutaptų su serverio HTML)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {
      /* ignoruojam */
    }
    setCartReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!cartReady) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* ignoruojam */
    }
  }, [cart, cartReady]);

  // krepšelio kainos iš serverio, kai pasikeičia prekių sąrašas
  const cartKeys = useMemo(() => Object.keys(cart).sort().join("\n"), [cart]);
  const lastKeys = useRef("");
  useEffect(() => {
    if (!cartReady || cartKeys === lastKeys.current) return;
    lastKeys.current = cartKeys;
    if (!cartKeys) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffersLoading(true);
    setOffersError(null);
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: cartKeys.split("\n") }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Serverio klaida"))))
      .then((data: { offers: Offers }) => setOffers(data.offers))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setOffersError("Nepavyko gauti krepšelio kainų.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setOffersLoading(false);
      });
    return () => controller.abort();
  }, [cartKeys, cartReady]);

  const addToCart = (p: ProductWithKey) =>
    setCart((c) => ({
      ...c,
      [p.groupKey]: { name: p.name, imageUrl: p.imageUrl, qty: (c[p.groupKey]?.qty ?? 0) + 1 },
    }));

  const setQty = (key: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[key];
      else if (next[key]) next[key] = { ...next[key], qty: Math.min(qty, 99) };
      return next;
    });

  const cartCount = useMemo(() => Object.values(cart).reduce((s, l) => s + l.qty, 0), [cart]);
  const totals = useMemo(() => computeTotals(cart, cartKeys ? offers : {}), [cart, cartKeys, offers]);
  const { best } = totals;
  const maxTotal = Math.max(1, ...totals.perStore.map((s) => s.total));

  return (
    <div className="min-h-screen bg-white text-neutral-900 antialiased">
      {/* ---------- viršus ---------- */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-neutral-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="font-semibold tracking-tight">
            kainos<span className="text-emerald-600">.</span>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            aria-label="Atidaryti krepšelį"
            className="flex items-center gap-2 text-sm font-medium px-3.5 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-900 transition"
          >
            Krepšelis
            <span
              className={`grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                cartCount > 0 ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {cartCount}
            </span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5">
        {/* ---------- paieška ---------- */}
        <section className="pt-14 pb-10 md:pt-20 md:pb-12">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-xl">
            Pigiausias krepšelis. <span className="text-neutral-400">Viena parduotuvė.</span>
          </h1>
          <div className="mt-8 max-w-xl">
            <input
              type="text"
              placeholder="Ieškoti prekės…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-[15px] outline-none placeholder:text-neutral-400 focus:bg-white focus:border-neutral-900 transition"
            />
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compareOnly}
                onChange={(e) => setCompareOnly(e.target.checked)}
                className="accent-neutral-900"
              />
              Tik prekės, kurias galima palyginti
            </label>
          </div>
        </section>

        {/* ---------- prekės ---------- */}
        {!loading && !error && (
          <p className="mb-5 text-sm text-neutral-400">{pagination.total.toLocaleString("lt-LT")} prekių</p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 rounded-2xl bg-neutral-50 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => fetchProducts(pagination.page, searchQuery, compareOnly)}
              className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition"
            >
              Bandyti iš naujo
            </button>
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-neutral-400 py-20">Prekių nerasta.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {products.map((product) => {
              const inCart = cart[product.groupKey]?.qty ?? 0;
              const cheapest = product.prices[0];
              const priciest = product.prices[product.prices.length - 1];
              const diff = priciest.price - cheapest.price;
              return (
                <li key={product.groupKey} className="flex flex-col">
                  <div className="relative grid place-items-center h-52 rounded-2xl bg-neutral-50 overflow-hidden">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        className="max-h-40 max-w-[75%] object-contain mix-blend-multiply"
                      />
                    ) : (
                      <span className="text-neutral-300 text-sm">Nėra nuotraukos</span>
                    )}
                    {product.prices.length > 1 && diff > 0.004 && (
                      <span className="absolute top-3 left-3 rounded-full bg-white text-emerald-700 text-xs font-medium px-2.5 py-1 border border-emerald-100">
                        −{eur(diff)}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-4 text-[15px] font-medium leading-snug line-clamp-2 min-h-[2.6em]">
                    {product.name}
                  </h2>

                  <ul className="mt-3 divide-y divide-neutral-100 border-y border-neutral-100">
                    {product.prices.map((priceItem: StorePrices, i: number) => {
                      const isBest = i === 0 && product.prices.length > 1;
                      return (
                        <li key={priceItem.store}>
                          <a
                            href={priceItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between py-2 text-sm hover:text-neutral-500 transition"
                          >
                            <span className="flex items-center gap-2">
                              <StoreDot store={priceItem.store} />
                              {storeLabel(priceItem.store)}
                              {priceItem.isOnSale && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                                  akcija
                                </span>
                              )}
                            </span>
                            <span className="flex items-baseline gap-2 tabular-nums">
                              {priceItem.oldPrice && (
                                <s className="text-xs text-neutral-300">{eur(priceItem.oldPrice)}</s>
                              )}
                              <span className={isBest ? "font-semibold text-emerald-600" : "font-medium"}>
                                {eur(priceItem.price)}
                              </span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4">
                    {inCart > 0 ? (
                      <div className="flex items-center justify-between rounded-full border border-neutral-900 px-1.5 py-1">
                        <button
                          onClick={() => setQty(product.groupKey, inCart - 1)}
                          aria-label="Mažinti"
                          className="w-8 h-8 rounded-full text-lg hover:bg-neutral-100"
                        >
                          −
                        </button>
                        <span className="text-sm font-medium tabular-nums">{inCart}</span>
                        <button
                          onClick={() => setQty(product.groupKey, inCart + 1)}
                          aria-label="Didinti"
                          className="w-8 h-8 rounded-full text-lg hover:bg-neutral-100"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-full py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 active:scale-[.98] transition"
                      >
                        Į krepšelį
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Puslapiavimas */}
        {!loading && !error && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-6 py-14 text-sm">
            <button
              disabled={pagination.page === 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="font-medium disabled:opacity-30 hover:underline"
            >
              ← Atgal
            </button>
            <span className="text-neutral-400 tabular-nums">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page === pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="font-medium disabled:opacity-30 hover:underline"
            >
              Toliau →
            </button>
          </div>
        )}
      </main>

      {/* Plaukiojantis mygtukas */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-neutral-900 text-white pl-5 pr-2 py-2 shadow-xl hover:bg-neutral-700 transition"
        >
          <span className="text-sm font-medium">Kur pigiausia?</span>
          <span className="grid place-items-center min-w-7 h-7 px-2 rounded-full bg-white text-neutral-900 text-xs font-semibold">
            {cartCount}
          </span>
        </button>
      )}

      {/* ---------- krepšelis ---------- */}
      {cartOpen && <div className="fixed inset-0 bg-neutral-900/30 z-30" onClick={() => setCartOpen(false)} />}
      <aside
        aria-hidden={!cartOpen}
        className={`fixed top-0 right-0 bottom-0 z-40 w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-neutral-100">
          <h2 className="font-semibold">Krepšelis</h2>
          <button
            onClick={() => setCartOpen(false)}
            aria-label="Uždaryti"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>

        {cartCount === 0 ? (
          <p className="p-8 text-center text-neutral-400">
            Krepšelis tuščias. Pridėk prekių ir parodysim, kur pigiausia viską nusipirkti.
          </p>
        ) : (
          <div className="px-6 py-6 overflow-y-auto flex flex-col gap-8">
            {/* rekomendacija */}
            {offersLoading && <p className="text-sm text-neutral-400">Skaičiuojama…</p>}
            {offersError && <p className="text-sm text-red-600">{offersError}</p>}

            {!offersLoading && !offersError && best && (
              <section>
                <div className="text-xs uppercase tracking-widest text-neutral-400">
                  {best.complete ? "Pirk čia" : "Artimiausias variantas"}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <StoreDot store={best.store} />
                  <span className="text-2xl font-semibold tracking-tight">{storeLabel(best.store)}</span>
                </div>
                <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{eur(best.total)}</div>
                {totals.saving > 0.004 && totals.worstComplete && (
                  <p className="mt-3 text-sm text-emerald-700">
                    Sutaupai {eur(totals.saving)} lyginant su {storeLabel(totals.worstComplete.store)}.
                  </p>
                )}
                {totals.nobodyHasAll && (
                  <p className="mt-3 text-sm text-neutral-500">
                    Nė viena parduotuvė neturi visų prekių, čia trūksta {best.missing.length}{" "}
                    {best.missing.length === 1 ? "prekės" : "prekių"}.
                  </p>
                )}
              </section>
            )}

            {/* visų parduotuvių palyginimas */}
            {!offersLoading && !offersError && best && (
              <section>
                <h3 className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Palyginimas</h3>
                <ul className="flex flex-col gap-4">
                  {totals.perStore.map((s) => {
                    const hasAny = s.missing.length < Object.keys(cart).length;
                    return (
                      <li key={s.store} className={hasAny ? "" : "opacity-40"}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="flex items-center gap-2 font-medium">
                            <StoreDot store={s.store} />
                            {storeLabel(s.store)}
                            {s.store === best.store && best.complete && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                                pigiausia
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums font-medium">{hasAny ? eur(s.total) : "—"}</span>
                        </div>
                        <div className="mt-2 h-1 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: hasAny ? `${(s.total / maxTotal) * 100}%` : "0%",
                              backgroundColor: storeColor(s.store),
                            }}
                          />
                        </div>
                        {!s.complete && (
                          <p className="mt-1.5 text-xs text-neutral-400">
                            {hasAny
                              ? `Trūksta ${s.missing.length} ${s.missing.length === 1 ? "prekės" : "prekių"}`
                              : "Neturi nė vienos iš krepšelio prekių"}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* kainų lentelė: prekė × parduotuvė */}
            {!offersLoading && !offersError && best && (
              <section>
                <h3 className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Kaip skaičiuojama</h3>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-xs tabular-nums border-collapse">
                    <thead>
                      <tr className="text-neutral-400">
                        <th className="text-left font-normal pb-2 pr-2">Prekė</th>
                        {totals.perStore
                          .filter((st) => st.missing.length < Object.keys(cart).length)
                          .map((st) => (
                            <th key={st.store} className="text-right font-medium pb-2 pl-2 text-neutral-700">
                              {storeLabel(st.store)}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cart).map(([key, line]) => {
                        const shown = totals.perStore.filter((st) => st.missing.length < Object.keys(cart).length);
                        const prices = shown
                          .map((st) => offers[key]?.[st.store]?.price)
                          .filter((v): v is number => v !== undefined);
                        const min = prices.length ? Math.min(...prices) : undefined;
                        return (
                          <tr key={key} className="border-t border-neutral-100">
                            <td className="py-2 pr-2 align-top max-w-[9rem]">
                              <div className="line-clamp-2 leading-snug text-neutral-700">
                                {line.qty > 1 ? `${line.qty} × ` : ""}
                                {line.name}
                              </div>
                            </td>
                            {shown.map((st) => {
                              const o = offers[key]?.[st.store];
                              return (
                                <td
                                  key={st.store}
                                  className={`py-2 pl-2 text-right align-top ${
                                    o && o.price === min ? "text-emerald-600 font-semibold" : o ? "" : "text-neutral-300"
                                  }`}
                                >
                                  {o ? eur(o.price * line.qty) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-neutral-900">
                        <td className="pt-2 pr-2 font-semibold">Iš viso</td>
                        {totals.perStore
                          .filter((st) => st.missing.length < Object.keys(cart).length)
                          .map((st) => (
                            <td
                              key={st.store}
                              className={`pt-2 pl-2 text-right font-semibold ${
                                st.store === best.store ? "text-emerald-600" : ""
                              }`}
                            >
                              {eur(st.total)}
                              {!st.complete && <span className="text-red-500">*</span>}
                            </td>
                          ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {totals.perStore.some((st) => !st.complete && st.missing.length < Object.keys(cart).length) && (
                  <p className="mt-2 text-xs text-neutral-400">
                    <span className="text-red-500">*</span> Šioje parduotuvėje trūksta kai kurių prekių, todėl suma nepilna
                    ir jos nerekomenduojame.
                  </p>
                )}
              </section>
            )}

            {/* prekės */}
            <section>
              <h3 className="text-xs uppercase tracking-widest text-neutral-400 mb-3">
                Prekės{best && !offersLoading ? ` · ${storeLabel(best.store)}` : ""}
              </h3>
              <ul className="divide-y divide-neutral-100">
                {Object.entries(cart).map(([key, line]) => {
                  const offer = best ? offers[key]?.[best.store] : undefined;
                  return (
                    <li key={key} className="flex items-center gap-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-snug line-clamp-2">{line.name}</div>
                        {best && !offersLoading && (
                          <div className="text-xs mt-1 tabular-nums">
                            {offer ? (
                              <a
                                href={offer.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-neutral-400 hover:text-neutral-900"
                              >
                                {eur(offer.price)} × {line.qty} ={" "}
                                <span className="font-medium text-neutral-900">{eur(offer.price * line.qty)}</span>
                              </a>
                            ) : (
                              <span className="text-red-600">Šioje parduotuvėje nerasta</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setQty(key, line.qty - 1)}
                          aria-label="Mažinti"
                          className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-900"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                        <button
                          onClick={() => setQty(key, line.qty + 1)}
                          aria-label="Didinti"
                          className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-900"
                        >
                          +
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <button onClick={() => setCart({})} className="text-sm text-neutral-400 hover:text-neutral-900 text-left">
              Išvalyti krepšelį
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}