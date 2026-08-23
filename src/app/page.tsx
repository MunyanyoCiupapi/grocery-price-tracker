import { MockProducts } from "@/data/mockProducts";

export default function Home() {
  return(
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1 className="text-4xl font-bold mb-8">Product List</h1>
      {MockProducts.map((product) => {
        return(<li key = {product.id} className="mb-4">
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          <ul>
            {product.prices.map((price) => {
              return(<li key={price.store}>
                <h2>{price.store}</h2>
                <p>Price: {price.price}</p>
                {price.isOnSale && (
                  <div>
                  <p>Old Price: {price.oldPrice}</p>
                  <p>Is on sale: {price.isOnSale}</p>
                  <p>Unit: {price.measurementUnit}</p>
                  </div>
                )}
                </li>)
            })}
          </ul>
        </li>)

      })}
    </main>   
  )
}