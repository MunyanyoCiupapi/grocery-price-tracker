"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/types/products";

type Point = { store: string; price: number; date: string; current?: boolean };
const colors: Record<string, string> = { RIMI: "#e11d48", MAXIMA: "#2563eb", IKI: "#ea580c", LIDL: "#a16207", NORFA: "#16a34a" };
const labels: Record<string, string> = { RIMI: "Rimi", MAXIMA: "Maxima", IKI: "IKI", LIDL: "Lidl", NORFA: "Norfa" };
const money = (value: number) => new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR" }).format(value);
const date = (value: number | string) => new Date(value).toLocaleDateString("lt-LT", { timeZone: "Europe/Vilnius" });

export default function PriceHistory({ product, onClose }: { product: Product & { groupKey: string }; onClose: () => void }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [current, setCurrent] = useState<Point[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/history?key=${encodeURIComponent(product.groupKey)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { points: Point[]; current: Point[] }) => {
        setPoints(data.points.filter((point) => Number.isFinite(point.price) && Number.isFinite(Date.parse(point.date))));
        setCurrent(data.current.filter((point) => Number.isFinite(point.price) && Number.isFinite(Date.parse(point.date))));
        setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [product.groupKey]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const chart = useMemo(() => {
    if (!points.length && !current.length) return null;
    const sorted = [...points, ...current.map((point) => ({ ...point, current: true }))].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const times = sorted.map((point) => Date.parse(point.date));
    const prices = sorted.map((point) => point.price);
    const start = times[0], end = times[times.length - 1];
    const min = Math.min(...prices), max = Math.max(...prices);
    const padding = Math.max((max - min) * 0.15, 0.1);
    const low = Math.max(0, min - padding), high = max + padding;
    const x = (time: number) => start === end ? 330 : 75 + (time - start) / (end - start) * 495;
    const y = (price: number) => 205 - (price - low) / (high - low) * 170;
    const stores = [...new Set(sorted.map((point) => point.store))];
    const latest = current;
    return { sorted, start, end, low, high, x, y, stores, latest };
  }, [points, current]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="history-title" className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Kainų palyginimas</p><h2 id="history-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Kaip keitėsi kaina?</h2><p className="mt-2 text-sm leading-relaxed text-neutral-500">{product.name}</p></div>
          <button onClick={onClose} aria-label="Uždaryti" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-200 hover:bg-neutral-100">✕</button>
        </div>
        {state === "loading" ? <p className="py-16 text-center text-sm text-neutral-400">Kraunama…</p> : state === "error" ? <p className="py-16 text-center text-sm text-red-600">Nepavyko gauti kainų istorijos. Bandykite dar kartą.</p> : !chart ? <p className="py-16 text-center text-sm text-neutral-400">Šios prekės kainų istorijos dar nėra.</p> : <>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-neutral-900">Paskutinės kainos</p><p className="mt-1 text-xs text-neutral-400">Pasirinkite parduotuvę jos istorijai peržiūrėti</p></div><button type="button" onClick={() => { setSelectedStore(null); setSelectedPoint(null); }} aria-pressed={selectedStore === null} className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${selectedStore === null ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>Visos parduotuvės</button></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{chart.latest.map((point) => <button key={point.store} type="button" onClick={() => { setSelectedStore(selectedStore === point.store ? null : point.store); setSelectedPoint(null); }} aria-pressed={selectedStore === point.store} className={`relative rounded-2xl border p-4 text-left transition ${selectedStore === point.store ? "border-neutral-900 bg-neutral-50 shadow-sm" : "border-neutral-100 bg-white hover:border-neutral-300 hover:shadow-sm"}`}><span className="flex items-center gap-2 text-xs font-medium text-neutral-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[point.store] || "#64748b" }} />{labels[point.store] || point.store}</span><span className="mt-3 block text-2xl font-semibold tracking-tight tabular-nums">{money(point.price)}</span><span className="mt-1.5 block text-[11px] text-neutral-400">Atnaujinta DB {date(point.date)}</span></button>)}</div>
          <div className="mt-6 rounded-2xl border border-neutral-100 bg-white px-3 pb-4 pt-5 sm:px-5">
            <div className="flex min-h-10 items-start justify-between gap-3 px-1"><div><p className="text-sm font-semibold text-neutral-800">Kainų istorija</p><p className="mt-1 text-xs text-neutral-400">Pastarieji metai · pasirinkite tašką</p></div>{selectedPoint && <div aria-live="polite" className="rounded-xl bg-neutral-50 px-3 py-2 text-right"><p className="text-sm font-semibold tabular-nums" style={{ color: colors[selectedPoint.store] || "#64748b" }}>{labels[selectedPoint.store] || selectedPoint.store} · {money(selectedPoint.price)}</p><p className="mt-1 text-xs text-neutral-400">{date(selectedPoint.date)}{selectedPoint.current ? " · DB atnaujinta" : " · istorijos įrašas"}</p></div>}</div>
            <svg viewBox="0 0 600 245" className="mt-3 w-full" role="img" aria-label="Kainų pagal parduotuves grafikas; reikšmės pateiktos lentelėje po grafiku">
              {[0, 1, 2, 3, 4].map((tick) => { const value = chart.low + (chart.high - chart.low) * tick / 4; const y = chart.y(value); return <g key={tick}><line x1="75" x2="570" y1={y} y2={y} stroke="#f0f0ee" /><text x="65" y={y + 4} textAnchor="end" fontSize="11" fill="#a3a3a3">{money(value)}</text></g>; })}
              {selectedPoint && <line x1={chart.x(Date.parse(selectedPoint.date))} x2={chart.x(Date.parse(selectedPoint.date))} y1="30" y2="205" stroke="#a3a3a3" strokeDasharray="3 5" />}
              {chart.stores.filter((store) => !selectedStore || store === selectedStore).map((store) => { const series = chart.sorted.filter((point) => point.store === store); const color = colors[store] || "#64748b"; const path = series.map((point, index) => { const x = chart.x(Date.parse(point.date)); const y = chart.y(point.price); if (!index) return `M ${x} ${y}`; const previous = series[index - 1]; const previousX = chart.x(Date.parse(previous.date)); const previousY = chart.y(previous.price); if (x === previousX) return `L ${x} ${y}`; const middle = (previousX + x) / 2; return `C ${middle} ${previousY}, ${middle} ${y}, ${x} ${y}`; }).join(" "); return <g key={store}><path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />{series.map((point, index) => <g key={index} onPointerEnter={() => setSelectedPoint(point)} onClick={() => setSelectedPoint(point)} className="cursor-pointer"><circle cx={chart.x(Date.parse(point.date))} cy={chart.y(point.price)} r="13" fill="transparent" /><circle cx={chart.x(Date.parse(point.date))} cy={chart.y(point.price)} r={selectedPoint === point ? "7" : "4.5"} fill={point.current ? "white" : color} stroke={point.current ? color : "white"} strokeWidth="2" /><title>{labels[store] || store}: {money(point.price)} · {date(point.date)}{point.current ? " · DB atnaujinta" : " · istorijos įrašas"}</title></g>)}</g>; })}
              <text x={chart.start === chart.end ? 330 : 75} y="231" textAnchor={chart.start === chart.end ? "middle" : "start"} fontSize="11" fill="#737373">{date(chart.start)}</text>
              {chart.start !== chart.end && <text x="570" y="231" textAnchor="end" fontSize="11" fill="#737373">{date(chart.end)}</text>}
            </svg>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-neutral-500" />Kainos pokytis</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-neutral-500 bg-white" />Paskutinė įkelta kaina</span></div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">Kiekvienas taškas žymi užfiksuotą kainą. Pasirinkite jį, kad pamatytumėte kainą ir datą. DB atnaujinimo data nebūtinai sutampa su kainos pasikeitimo data.</p>
          <details className="mt-5 border-t border-neutral-100 pt-4"><summary className="cursor-pointer text-sm font-medium text-neutral-700">Peržiūrėti kainų įrašus</summary><div className="mt-3 max-h-52 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="text-neutral-400"><tr><th className="pb-2 font-normal">Data</th><th className="pb-2 font-normal">Parduotuvė</th><th className="pb-2 text-right font-normal">Kaina</th></tr></thead><tbody>{[...chart.sorted].reverse().map((point, index) => <tr key={index} className="border-t border-neutral-100"><td className="py-2">{date(point.date)}{point.current && <span className="ml-1 text-xs text-neutral-400">(DB atnaujinta)</span>}</td><td>{labels[point.store] || point.store}</td><td className="text-right tabular-nums">{money(point.price)}</td></tr>)}</tbody></table></div></details>
        </>}
      </section>
    </div>
  );
}
