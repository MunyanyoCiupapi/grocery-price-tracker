import { Product } from "@/types/products";

export const MockProducts : Product[] = [
    {
        id: "1",
        name: "Varse rokiskio",
        description: "Aprasymas",
        prices: [
            {
                store: "MAXIMA",
                price: 10.99
            },
            {
                store: "IKI",
                price: 12.99,
                oldPrice: 14.99,
                isOnSale: true
            }
        ]
    },
    {
        id: "2",
        name: "Pienas dvaro",
        description: "Aprasymas pieno",
        prices: [
            {
                store: "MAXIMA",
                price: 2
            },
            {
                store: "IKI",
                price: 3
            }
        ]
    },
    {
        id: "3",
        name: "Duona",
        description: "Aprasymas duonos",
        prices: [
            {
                store: "MAXIMA",
                price: 1.5
            },
            {
                store: "NORFA",
                price: 1.8
            },
            {
                store: "LIDL",
                price: 1,
                oldPrice: 1.5,
                isOnSale: true
            }
        ]
    },
    {
        id: "4",
        name: "Sviestas",
        description: "Aprasymas sviesto",
        prices: [
            {
                store: "MAXIMA",
                price: 5
            },
            {
                store: "RIMI",
                price: 4.5
            }
        ]
    }
]