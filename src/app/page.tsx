"use client";

import { useEffect, useState } from "react";
import { Product } from "@/types/products";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prices");
      if (!res.ok) {
        throw new Error("Failed to fetch products");
      }

      const data: Product[] = await res.json();
      setProducts(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Klaida įvyko");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg font-medium text-gray-600">Kraunamos kainos iš parduotuvių...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <p className="text-lg font-medium text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
        >
          Bandyti iš naujo
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-50 text-gray-800">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-blue-600">Kainų Agregatorius</h1>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
          Atnaujinti kainas
        </button>
      </div>

      <div className="w-full max-w-5xl space-y-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-6 items-start"
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
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
                {product.prices.map((priceItem: any) => (
                  <a
                    key={priceItem.store}
                    href={priceItem.url || product.url}
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
        ))}
      </div>
    </main>
  );
}