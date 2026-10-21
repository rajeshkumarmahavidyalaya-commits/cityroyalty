'use client';
import type { ProductCardDTO } from '@cityroyalty/shared';
import { useWishlist } from '@/lib/store';
import { HeartIcon } from '../ui/Icons';

export function WishlistButton({ product, className = '' }: { product: Pick<ProductCardDTO, 'id' | 'title'>; className?: string }) {
  const { has, toggle } = useWishlist();
  const on = has(product.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${product.title} from wishlist` : `Add ${product.title} to wishlist`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(product);
      }}
      className={`grid h-10 w-10 place-items-center rounded-full bg-ivory/90 text-royal backdrop-blur transition-transform hover:scale-105 ${className}`}
    >
      <HeartIcon filled={on} width={20} height={20} />
    </button>
  );
}
