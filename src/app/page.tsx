"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Product, StorePrices } from "@/types/products";
import Link from "next/link";
import PriceHistory from "@/components/PriceHistory";
import { CATEGORY_OPTIONS } from "@/lib/sourceCategories";

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
  const [category, setCategory] = useState("");
  const [history, setHistory] = useState<ProductWithKey | null>(null);
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

  const requestId = useRef(0);
  const fetchProducts = useCallback(async (page: number, query: string, compare: boolean, selectedCategory: string) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/prices?page=${page}&limit=24&q=${encodeURIComponent(query)}${compare ? "&compare=1" : ""}&category=${encodeURIComponent(selectedCategory)}`,
      );
      if (!res.ok) throw new Error("Nepavyko užkrauti prekių.");

      const data = await res.json();
      if (currentRequest !== requestId.current) return;
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (err) {
      if (currentRequest === requestId.current) setError(err instanceof Error ? err.message : "Įvyko klaida.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1, searchQuery, compareOnly, category);
    }, 300); // Debounce paieškai

    return () => clearTimeout(timer);
  }, [searchQuery, compareOnly, category, fetchProducts]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(newPage, searchQuery, compareOnly, category);
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
    <div className="min-h-screen bg-[#f8f9f6] text-[#19251d] antialiased">
      {/* ---------- viršus ---------- */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-xl font-semibold tracking-tight"><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#173d2d] text-white text-base">k</span>kainos<span className="-ml-3 text-emerald-600">.</span></Link>
          <button
            onClick={() => setCartOpen(true)}
            aria-label="Atidaryti krepšelį"
            className="flex items-center gap-2.5 rounded-full border border-[#dce5dc] bg-white px-4 py-2 text-sm font-medium transition hover:border-emerald-700 hover:text-emerald-800"
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

      <main className="max-w-6xl mx-auto px-5">
        {/* ---------- paieška ---------- */}
        <section className="relative mt-5 overflow-hidden rounded-[28px] bg-[#e8f1e6] md:mt-8 md:rounded-[36px]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border border-[#b8d1bb]/70 sm:h-[440px] sm:w-[440px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-[#b8d1bb]/60 sm:h-[360px] sm:w-[360px]" />
          <div className="relative grid gap-10 px-6 py-10 sm:px-10 md:grid-cols-[1fr_270px] md:items-end md:gap-12 md:px-12 md:py-12 lg:grid-cols-[1fr_300px]">
          <div>
          <p className="mb-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3a6b4e]"><span className="h-2 w-2 rounded-full bg-emerald-600" />Mažiau paieškų. Daugiau aiškumo.</p>
          <h1 className="max-w-2xl text-[2.65rem] font-semibold leading-[1.06] tracking-[-0.045em] text-[#173d2d] sm:text-5xl lg:text-[3.6rem]">
            Geresnės kainos prasideda <span className="text-[#6a9273]">nuo palyginimo.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-[#536b59]">Ieškok prekių, palygink parduotuves ir susidėk savo pirkinių krepšelį vienoje vietoje.</p>
          <div className="mt-7 max-w-xl">
            <label htmlFor="product-search" className="sr-only">Ieškoti prekės</label>
            <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>
            <input
              id="product-search"
              type="text"
              placeholder="Ko ieškai? Pvz., pieno ar kavos"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-white bg-white py-[18px] pl-12 pr-4 text-[15px] text-neutral-900 shadow-[0_10px_30px_rgba(28,65,39,0.07)] outline-none placeholder:text-neutral-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition"
            />
            </div>
            <label className="mt-4 inline-flex items-center gap-2.5 text-sm text-[#526b58] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compareOnly}
                onChange={(e) => setCompareOnly(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              Tik prekės, kurias galima palyginti
            </label>
          </div>
          </div>
          <div className="relative rounded-[24px] bg-[#173d2d] p-6 text-white shadow-[0_18px_40px_rgba(26,66,41,0.14)] sm:p-7">
            <div aria-hidden="true" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/20 text-lg text-[#b9ddbd]">↗</div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8cbae]">Kaip tai veikia</p>
            <p className="mt-5 max-w-[210px] text-xl font-medium leading-snug tracking-tight">Nuo paieškos iki krepšelio – paprastai.</p>
            <ol className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm text-[#e0eee1]">
              <li className="flex gap-3"><span className="text-[#91b99a]">01</span> Surask norimas prekes</li>
              <li className="flex gap-3"><span className="text-[#91b99a]">02</span> Palygink jų kainas</li>
              <li className="flex gap-3"><span className="text-[#91b99a]">03</span> Sudaryk krepšelį</li>
            </ol>
          </div>
          </div>
        </section>

        <nav aria-label="Prekių kategorijos" className="mb-9 mt-11">
          <div className="mb-4 flex items-baseline justify-between gap-4"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6b9074]">Atrask</p><h2 className="text-xl font-semibold tracking-tight">Ko šiandien ieškai?</h2></div><span className="hidden text-xs text-neutral-400 sm:inline">Pasirink kategoriją</span></div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {CATEGORY_OPTIONS.map(({ id: value, label }) => (
              <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={category === value}
                className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium transition ${category === value ? "border-[#173d2d] bg-[#173d2d] text-white" : "border-[#e2e9df] bg-white text-[#55635a] hover:border-emerald-500 hover:text-emerald-800"}`}>
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* ---------- prekės ---------- */}
        {!loading && !error && (
          <div className="mb-5 flex items-baseline justify-between gap-4 border-t border-[#e6ebe3] pt-7"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6b9074]">Palygink</p><h2 className="text-xl font-semibold tracking-tight">Atrask prekes</h2></div><p className="text-sm text-neutral-400">{pagination.total.toLocaleString("lt-LT")} prekių</p></div>
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
              onClick={() => fetchProducts(pagination.page, searchQuery, compareOnly, category)}
              className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition"
            >
              Bandyti iš naujo
            </button>
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-neutral-400 py-20">Prekių nerasta.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {products.map((product) => {
              const inCart = cart[product.groupKey]?.qty ?? 0;
              const cheapest = product.prices[0];
              const priciest = product.prices[product.prices.length - 1];
              const diff = priciest.price - cheapest.price;
              return (
                <li key={product.groupKey} className="flex flex-col rounded-[24px] border border-[#e8ede6] bg-white p-4 shadow-[0_2px_14px_rgba(24,39,28,0.025)] transition hover:border-emerald-200 hover:shadow-[0_12px_35px_rgba(24,39,28,0.07)]">
                  <div className="relative grid place-items-center h-52 rounded-[18px] bg-[#f5f7f2] overflow-hidden">
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
                      <span className="absolute top-3 left-3 rounded-full bg-white text-[#327147] text-xs font-semibold px-3 py-1.5 shadow-sm">
                        Skirtumas {eur(diff)}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-[15px] font-semibold leading-snug line-clamp-2 min-h-[2.6em]">
                    {product.name}
                  </h3>

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

                  <button onClick={() => setHistory(product)} className="mt-4 self-start text-sm font-medium text-emerald-700 hover:text-emerald-900 underline decoration-emerald-200 underline-offset-4">Kainų istorija <span aria-hidden="true">↗</span></button>
                  <div className="mt-auto pt-4">
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
                        className="w-full py-3 rounded-full bg-[#173d2d] text-white text-sm font-medium hover:bg-[#285a3e] active:scale-[.98] transition"
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

      {history && <PriceHistory product={history} onClose={() => setHistory(null)} />}

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
