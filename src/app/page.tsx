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
  const isSearching = searchQuery.trim().length > 0;
  const [category, setCategory] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [history, setHistory] = useState<ProductWithKey | null>(null);
  const [compareOnly, setCompareOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // krepšelis
  const [cart, setCart] = useState<Cart>({});
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [offers, setOffers] = useState<Offers>({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadedFilters = useRef("");
  const fetchProducts = useCallback(async (page: number, query: string, compare: boolean, selectedCategory: string) => {
    const append = page > 1;
    if (append && loadingMoreRef.current) return;
    if (append) loadingMoreRef.current = true;
    const currentRequest = ++requestId.current;
    if (append) {
      setLoadingMore(true);
      setLoadMoreError(null);
    } else {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
    }
    try {
      const res = await fetch(
        `/api/prices?page=${page}&limit=24&q=${encodeURIComponent(query)}${compare ? "&compare=1" : ""}&category=${encodeURIComponent(selectedCategory)}`,
      );
      if (!res.ok) throw new Error("Nepavyko užkrauti prekių.");

      const data = await res.json();
      if (currentRequest !== requestId.current) return;
      loadedFilters.current = JSON.stringify([query, compare, selectedCategory]);
      setProducts((current) => {
        if (!append) return data.products;
        const existing = new Set(current.map((product) => product.groupKey));
        return [...current, ...data.products.filter((product: ProductWithKey) => !existing.has(product.groupKey))];
      });
      setPagination(data.pagination);
    } catch (err) {
      if (currentRequest === requestId.current) {
        const message = err instanceof Error ? err.message : "Įvyko klaida.";
        if (append) setLoadMoreError(message);
        else setError(message);
      }
    } finally {
      if (currentRequest === requestId.current) {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const activeRequest = requestId;
    const timer = setTimeout(() => {
      fetchProducts(1, searchQuery, compareOnly, category);
    }, 180); // Trumpa pauzė, kad rašant nebūtų siunčiama užklausa po kiekvienos raidės.

    return () => {
      clearTimeout(timer);
      activeRequest.current++;
      loadingMoreRef.current = false;
    };
  }, [searchQuery, compareOnly, category, fetchProducts]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || loading || loadingMore || error || loadMoreError || pagination.page >= pagination.totalPages || loadedFilters.current !== JSON.stringify([searchQuery, compareOnly, category])) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchProducts(pagination.page + 1, searchQuery, compareOnly, category);
    }, { rootMargin: "400px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, loadingMore, error, loadMoreError, pagination.page, pagination.totalPages, searchQuery, compareOnly, category, fetchProducts]);

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
        <section className={`relative overflow-hidden rounded-[28px] bg-[#e8f1e6] md:rounded-[36px] ${isSearching ? "mt-4" : "mt-5 md:mt-8"}`}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border border-[#b8d1bb]/70 sm:h-[440px] sm:w-[440px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-[#b8d1bb]/60 sm:h-[360px] sm:w-[360px]" />
          <div className={`relative grid px-6 transition-[padding,gap] duration-500 ease-in-out motion-reduce:transition-none sm:px-10 md:grid-cols-[1fr_270px] md:items-end md:px-12 lg:grid-cols-[1fr_300px] ${isSearching ? "gap-0 py-5 md:gap-12 md:py-6" : "gap-10 py-10 md:gap-12 md:py-12"}`}>
          <div>
          <div aria-hidden={isSearching} inert={isSearching} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out motion-reduce:transition-none ${isSearching ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}><div className="overflow-hidden"><p className="mb-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3a6b4e]"><span className="h-2 w-2 rounded-full bg-emerald-600" />Mažiau paieškų. Daugiau aiškumo.</p>
          <h1 className="max-w-2xl text-[2.65rem] font-semibold leading-[1.06] tracking-[-0.045em] text-[#173d2d] sm:text-5xl lg:text-[3.6rem]">
            Geresnės kainos prasideda <span className="text-[#6a9273]">nuo palyginimo.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-[#536b59]">Ieškok prekių, palygink parduotuves ir susidėk savo pirkinių krepšelį vienoje vietoje.</p></div></div>
          <div className={`max-w-xl transition-[margin] duration-500 ease-in-out motion-reduce:transition-none ${isSearching ? "mt-0" : "mt-7"}`}>
            <label htmlFor="product-search" className="sr-only">Ieškoti prekės</label>
            <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>
            <input
              id="product-search"
              type="text"
              placeholder="Ko ieškai? Pvz., pieno ar kavos"
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                if (value.trim()) setCategory("");
              }}
              className="w-full rounded-2xl border border-white bg-white py-[18px] pl-12 pr-12 text-[15px] text-neutral-900 shadow-[0_10px_30px_rgba(28,65,39,0.07)] outline-none placeholder:text-neutral-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition"
            />
            {isSearching && <button type="button" onClick={() => setSearchQuery("")} aria-label="Išvalyti paiešką" className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-xl text-[#6c7b70] hover:bg-[#edf4eb] hover:text-[#173d2d]">×</button>}
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
          <div aria-hidden={isSearching} inert={isSearching} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out motion-reduce:transition-none ${isSearching ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}><div className="overflow-hidden"><div className="relative rounded-[24px] bg-[#173d2d] p-6 text-white shadow-[0_18px_40px_rgba(26,66,41,0.14)] sm:p-7">
            <div aria-hidden="true" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/20 text-lg text-[#b9ddbd]">↗</div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8cbae]">Kaip tai veikia</p>
            <p className="mt-5 max-w-[210px] text-xl font-medium leading-snug tracking-tight">Nuo paieškos iki krepšelio – paprastai.</p>
            <ol className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm text-[#e0eee1]">
              <li className="flex gap-3"><span className="text-[#91b99a]">01</span> Surask norimas prekes</li>
              <li className="flex gap-3"><span className="text-[#91b99a]">02</span> Palygink jų kainas</li>
              <li className="flex gap-3"><span className="text-[#91b99a]">03</span> Sudaryk krepšelį</li>
            </ol>
          </div></div></div>
          </div>
        </section>

        <div aria-hidden={isSearching} inert={isSearching} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out motion-reduce:transition-none ${isSearching ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}><div className="overflow-hidden"><nav aria-label="Prekių kategorijos" className="my-8 rounded-[28px] border border-[#e5ebe2] bg-white p-5 shadow-[0_8px_30px_rgba(30,55,35,0.035)] sm:p-7 md:my-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b9074]">Naršyk pagal kategoriją</p>
              <h2 className="text-xl font-semibold tracking-tight text-[#173d2d] sm:text-2xl">Ko šiandien ieškai?</h2>
              <p className="mt-1.5 text-sm text-[#78867a]">Pasirink kategoriją arba ieškok tarp visų prekių.</p>
            </div>
            <span className="rounded-full bg-[#f2f6f0] px-3 py-1.5 text-xs font-medium text-[#66816d]">{CATEGORY_OPTIONS.length - 1} kategorijų</span>
          </div>
          <div id="category-list" className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.filter((option, index) => showAllCategories || index < 8 || option.id === category).map(({ id: value, label }) => (
              <button key={value} type="button" onClick={() => { setCategory(value); setSearchQuery(""); }} aria-pressed={category === value}
                className={`rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${category === value ? "border-[#173d2d] bg-[#173d2d] text-white shadow-sm" : "border-[#e8eee6] bg-[#f8faf7] text-[#506457] hover:border-[#a9c8ae] hover:bg-[#edf5ec] hover:text-[#173d2d]"}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-expanded={showAllCategories} aria-controls="category-list" onClick={() => setShowAllCategories((open) => !open)}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#347451] transition hover:text-[#173d2d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
            {showAllCategories ? "Rodyti mažiau" : `Visos kategorijos (${CATEGORY_OPTIONS.length - 1})`}
            <span aria-hidden="true" className={`inline-block transition-transform ${showAllCategories ? "rotate-180" : ""}`}>↓</span>
          </button>
        </nav></div></div>

        {/* ---------- prekės ---------- */}
        {!loading && !error && (
          <div className={`mb-5 flex items-baseline justify-between gap-4 border-t border-[#e6ebe3] pt-7 ${isSearching ? "mt-6" : ""}`}><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6b9074]">Palygink</p><h2 className="text-xl font-semibold tracking-tight">{isSearching ? "Paieškos rezultatai" : "Atrask prekes"}</h2></div><p className="text-sm text-neutral-400">{pagination.total.toLocaleString("lt-LT")} prekių</p></div>
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
              onClick={() => fetchProducts(1, searchQuery, compareOnly, category)}
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

        {!loading && !error && products.length > 0 && (
          <div ref={loadMoreRef} className="flex min-h-24 flex-col items-center justify-center gap-3 py-8 text-sm text-neutral-400" aria-live="polite">
            {loadingMore ? "Kraunama daugiau prekių…" : loadMoreError ? (
              <><span>{loadMoreError}</span><button type="button" onClick={() => fetchProducts(pagination.page + 1, searchQuery, compareOnly, category)} className="font-medium text-emerald-700 underline underline-offset-4">Bandyti dar kartą</button></>
            ) : pagination.page >= pagination.totalPages ? "Parodytos visos prekės" : null}
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
