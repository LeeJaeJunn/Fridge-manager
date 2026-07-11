import type { ProductType } from '@companion/types';
import { Image } from 'expo-image';
import { Linking, Text, View } from 'react-native';

import { Card } from './Card';

/** 천단위 콤마 (Hermes Intl 의존 없이 직접) */
function withCommas(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPrice(price: number, currency: ProductType['currency']): string {
  return currency === 'USD' ? `$${withCommas(price)}` : `${withCommas(price)}원`;
}

/** 채팅 답변에 붙는 상품 카드 — 탭하면 상품 페이지로 이동 */
export function ProductCard({ product }: { product: ProductType }) {
  return (
    <Card
      onPress={() => void Linking.openURL(product.productUrl)}
      radius="2xl"
      className="flex-row items-center gap-3 p-3"
    >
      <Image
        source={{ uri: product.imageUrl }}
        style={{ width: 64, height: 64, borderRadius: 12 }}
        contentFit="cover"
      />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2} className="text-sm font-medium text-ink">
          {product.title}
        </Text>
        <Text className="text-base font-bold text-ink">
          {formatPrice(product.price, product.currency)}
        </Text>
        {(product.brand || product.mallName) && (
          <Text numberOfLines={1} className="text-xs text-ink-faint">
            {[product.brand, product.mallName].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <Text className="text-lg text-ink-faint">›</Text>
    </Card>
  );
}
