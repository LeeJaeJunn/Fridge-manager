import type {
  ProductSearchCriteriaType,
  ProductSearchResultType,
  ProductType,
} from '@companion/types';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 네이버 쇼핑검색 파라미터 한계
const NAVER_MAX_START = 1000;
const NAVER_MAX_DISPLAY = 100;

/** 네이버 쇼핑검색 API 응답 아이템 (원본) — 이 파일 밖으로 새지 않게 여기서만 안다 */
interface NaverShopItem {
  title: string; // <b> 하이라이트 태그 섞여 있음
  link: string;
  image: string;
  lprice: string; // 최저가 (문자열)
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}
interface NaverShopResponse {
  items: NaverShopItem[];
}

/** <b> 등 HTML 태그 제거 + 기본 엔티티 디코드 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * 상품 검색(retrieval)의 진입점. 네이버 쇼핑검색을 호출해 **정규화된 ProductType[]** 로 반환한다.
 * 벤더(네이버) 고유 형태(HTML title, 문자열 가격, category1~4)는 이 파일 안에서 흡수하고,
 * 소비처(추천·채팅·클라이언트)는 ProductType 만 본다.
 * 개인화 랭킹은 이 위 레이어(추천)의 책임이고, 여기선 후보 검색만 한다.
 */
@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('NAVER_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('NAVER_CLIENT_SECRET');
  }

  async search(criteria: ProductSearchCriteriaType): Promise<ProductSearchResultType> {
    const keywords = criteria.keywords.trim();
    if (!keywords) throw new BadRequestException('keywords 가 필요합니다');

    const limit = criteria.limit ?? 10;
    const start = Math.max(1, criteria.start ?? 1);
    // 네이버 start 상한(1000) 초과면 더 볼 게 없음
    if (start > NAVER_MAX_START) {
      return { products: [], nextStart: start, hasMore: false };
    }

    // 네이버 API엔 가격/카테고리 필터가 없어 후처리한다 → 필터 있으면 후보를 넉넉히 받아 거른다.
    // display 는 네이버 한계(100) 이하이기만 하면 된다. start 와 독립이라 start+display 가 1000 넘어도 됨.
    const needsPostFilter =
      criteria.priceMin != null || criteria.priceMax != null || Boolean(criteria.category);
    const display = Math.min(NAVER_MAX_DISPLAY, needsPostFilter ? limit * 3 : limit);

    const items = await this.fetchNaver(keywords, start, display);

    // raw 를 순서대로 스캔하며 필터 통과분을 limit 까지만 모은다.
    // 커서는 "실제로 스캔한 raw 개수"만큼만 전진 → slice 로 버려서 다음 페이지에서 건너뛰는 유실을 막는다.
    const products: ProductType[] = [];
    let scanned = 0;
    for (const it of items) {
      scanned++;
      const p = this.toProduct(it);
      if (criteria.category && p.category !== criteria.category) continue;
      if (criteria.priceMin != null && p.price < criteria.priceMin) continue;
      if (criteria.priceMax != null && p.price > criteria.priceMax) continue;
      products.push(p);
      if (products.length >= limit) break;
    }

    const nextStart = start + scanned;
    const brokeEarly = products.length >= limit && scanned < items.length; // 이번 창에 아직 raw 남음
    const rawFull = items.length === display; // 요청만큼 왔으면 뒤에 더 있을 수 있음
    const hasMore = (brokeEarly || rawFull) && nextStart <= NAVER_MAX_START;

    return { products, nextStart, hasMore };
  }

  /** 네이버 호출 — 벤더 에러는 여기서 잡아 의미있는 예외로 변환(바깥으로 안 샘) */
  private async fetchNaver(
    query: string,
    start: number,
    display: number,
  ): Promise<NaverShopItem[]> {
    const url = new URL('https://openapi.naver.com/v1/search/shop.json');
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));
    url.searchParams.set('start', String(start));
    url.searchParams.set('sort', 'sim'); // 정확도순 (개인화는 추천 레이어가 한다)
    url.searchParams.set('exclude', 'used:cbshop'); // 중고·해외직구 제외

    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`네이버 API 오류 (${res.status}): ${body}`);
        throw new ServiceUnavailableException('상품 검색에 실패했습니다');
      }
      const data = (await res.json()) as NaverShopResponse;
      return data.items ?? [];
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error('네이버 API 호출 실패', err as Error);
      throw new ServiceUnavailableException('상품 검색에 실패했습니다');
    }
  }

  /** 네이버 raw → 정규화 ProductType. description/rating 등은 네이버 미제공이라 비운다. */
  private toProduct(it: NaverShopItem): ProductType {
    const category = it.category4 || it.category3 || it.category2 || it.category1 || undefined;
    return {
      id: it.productId,
      provider: 'naver',
      title: stripHtml(it.title),
      price: Number(it.lprice) || 0,
      currency: 'KRW',
      imageUrl: it.image,
      productUrl: it.link,
      mallName: it.mallName || undefined,
      brand: it.brand || it.maker || undefined,
      category,
    };
  }
}
