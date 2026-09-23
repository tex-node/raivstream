'use client';

type Product = { id: string; name: string; description?: string | null };

/** Raivstream 5.0 — products under a studio. */
export function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0) return <p className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-sm text-[var(--noc-t5)]">No products yet.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {products.map((product) => (
        <div key={product.id} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Product</p>
          <h3 className="mt-1 text-lg font-black">{product.name}</h3>
          {product.description && <p className="mt-1 text-sm text-[var(--noc-t4)]">{product.description}</p>}
        </div>
      ))}
    </div>
  );
}