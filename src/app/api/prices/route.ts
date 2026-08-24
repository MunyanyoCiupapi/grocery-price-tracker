import { NextResponse } from "next/server";
import { Product } from "@/types/products";

export async function GET() {
  const products: Product[] = [
    {
      id: "1",
      name: "Pienas 2.5%",
      description: "Šviežias pasterizuotas pienas, 1L",
      prices: [
        { store: "MAXIMA", price: 1.19, oldPrice: 1.39, isOnSale: true },
        { store: "IKI", price: 1.29, isOnSale: false },
        { store: "LIDL", price: 0.99, isOnSale: true },
      ],
    },
    {
      id: "2",
      name: "Juoda Duona",
      description: "Ruginė duona su saulėgrąžomis, 500g",
      prices: [
        { store: "MAXIMA", price: 1.49, isOnSale: false },
        { store: "NORFA", price: 1.25, oldPrice: 1.45, isOnSale: true },
      ],
    },
  ];

  return NextResponse.json(products);
}