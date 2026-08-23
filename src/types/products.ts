export type StoreName = "MAXIMA" | "IKI" | "NORFA" | "LIDL" | "RIMI";

export interface Product {
    id: string;
    name: string;
    description: string;
    prices: StorePrices[];
    imageUrl?: string;
};

export interface StorePrices {
    store: StoreName;
    price: number;
    oldPrice?: number;
    isOnSale?: boolean;
    measurementUnit?: string;
};

export interface Basket {
    products: BasketItem[];
};

export interface BasketItem {
    product: Product;
    quantity: number;
}