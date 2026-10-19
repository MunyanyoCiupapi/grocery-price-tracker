"use client";

import { useEffect, useState, useCallback } from "react";
import { Product, StorePrices } from "@/types/products";

interface PaginationInfo {
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 24,
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async (page: number, query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prices?page=${page}&limit=24&q=${encodeURIComponent(query)}`);
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
      fetchProducts(1, searchQuery);
    }, 300); // Debounce paieškai

    return () => clearTimeout(timer);
  }, [searchQuery, fetchProducts]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(newPage, searchQuery);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50 text-gray-800">
      <div className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-blue-600">Kainų Agregatorius</h1>
        
        {/* Paieškos laukelis */}
        <input
          type="text"
          placeholder="Ieškoti prekės..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center my-20">
          <p className="text-lg font-medium text-gray-600">Kraunamos kainos iš parduotuvių...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center my-20">
          <p className="text-lg font-medium text-red-600 mb-4">{error}</p>
          <button
            onClick={() => fetchProducts(pagination.page, searchQuery)}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Bandyti iš naujo
          </button>
        </div>
      ) : (
        <>
          <div className="w-full max-w-5xl space-y-4 mb-8">
            {products.length === 0 ? (
              <p className="text-center text-gray-500 py-10">Prekių nerasta.</p>
            ) : (
              products.map((product) => (
                <div
                  key={product.id}
                  className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-6 items-start"
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="w-28 h-28 object-contain rounded-lg border border-gray-100 bg-gray-50 p-2 shrink-0"
                    />
                  ) : (
                    <div className="w-28 h-28 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs shrink-0">
                      Nėra nuotraukos
                    </div>
                  )}

                  <div className="flex-1 w-full">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h2>
                    <p className="text-sm text-gray-500 mb-4">{product.description}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {product.prices.map((priceItem: StorePrices) => (
                        <a
                          key={priceItem.store}
                          href={priceItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30 transition flex flex-col justify-between group"
                        >
                          <span className="text-xs font-semibold text-gray-500 uppercase group-hover:text-blue-600">
                            {priceItem.store} ↗
                          </span>

                          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg font-bold text-gray-900">
                              {priceItem.price} €
                            </span>
                            {priceItem.measurementUnit && (
                              <span className="text-xs text-gray-500">
                                / {priceItem.measurementUnit}
                              </span>
                            )}
                            {priceItem.oldPrice && (
                              <span className="text-xs text-gray-400 line-through w-full">
                                {priceItem.oldPrice} €
                              </span>
                            )}
                          </div>

                          {priceItem.isOnSale && (
                            <span className="mt-2 inline-block text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded w-fit">
                              Akcija
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Puslapiavimo valdymo pultas */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-4 my-4">
              <button
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-50 transition"
              >
                Atgal
              </button>
              <span className="text-sm font-medium text-gray-600">
                Puslapis {pagination.page} iš {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page === pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-50 transition"
              >
                Toliau
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}