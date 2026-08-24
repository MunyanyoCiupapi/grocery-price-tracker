"use client";

import { useEffect, useState } from "react";
import { Product } from "@/types/products";

export default function Home() {
  
  const [products, setProducts ] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prices");
      if(!res.ok){
        throw new Error("Failed to fetch products");
      }

      const data: Product[] = await res.json();
      setProducts(data);

    } catch (error) {
      setError(error instanceof Error ? error.message : "Klaida ivykooooo");
    } finally {
      setLoading(false);
    }
  }

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
      <div className="w-full max-w-3xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-blue-600">Kainų Agregatorius</h1>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
          Atnaujinti kainas
        </button>
      </div>

      <div className="w-full max-w-3xl space-y-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
          >
            <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{product.description}</p>

            {/* Parduotuvių kainų tinklelis */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {product.prices.map((priceItem) => (
                <div
                  key={priceItem.store}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    {priceItem.store}
                  </span>
                  
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {priceItem.price} €
                    </span>
                    {priceItem.oldPrice && (
                      <span className="text-xs text-gray-400 line-through">
                        {priceItem.oldPrice} €
                      </span>
                    )}
                  </div>

                  {priceItem.isOnSale && (
                    <span className="mt-2 inline-block text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded w-fit">
                      Akcija
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
};

