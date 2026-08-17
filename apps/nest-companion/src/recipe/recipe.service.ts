import type { RecipeSearchResultType, RecipeSourceType, RecipeType } from '@companion/types';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 네이버 검색 API 의 display 상한 */
const NAVER_MAX_DISPLAY = 100;
/** 카드로 보여줄 기본 개수 — 너무 많으면 모델이 요약하기도, 사용자가 고르기도 어렵다 */
const DEFAULT_LIMIT = 5;

/** `RecipeSourceType` → 네이버 서비스 경로. 벤더 어휘는 이 파일 밖으로 안 나간다. */
const NAVER_SERVICE: Record<RecipeSourceType, string> = {
  naver_web: 'webkr',
  naver_blog: 'blog',
};

/**
 * 네이버 검색 API 응답 아이템 (원본) — 이 파일 밖으로 안 새게 여기서만 안다.
 * `bloggername`/`postdate` 는 **블로그 검색에만** 있어서 옵셔널이다(웹문서는 3필드뿐).
 */
interface NaverSearchItem {
  title: string; // <b> 하이라이트 태그 섞여 있음
  link: string;
  description: string; // 여기도 <b> 섞임
  bloggername?: string;
  bloggerlink?: string;
  postdate?: string; // "20260802"
}
interface NaverSearchResponse {
  items?: NaverSearchItem[];
}

/** <b> 등 HTML 태그 제거 + 기본 엔티티 디코드 (네이버는 검색어를 <b> 로 감싸서 준다) */
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
 * 링크 → 표시용 도메인 ("10000recipe.com").
 * 깨진 링크 하나 때문에 검색 전체가 죽지 않도록 실패하면 빈 문자열을 준다(항목 자체는 살린다).
 */
function toDomain(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 네이버 blog 검색의 `postdate`("20260802") → "2026-08-02". 모양이 다르면 버린다. */
function toIsoDate(postdate: string | undefined): string | undefined {
  if (!postdate || !/^\d{8}$/.test(postdate)) return undefined;
  return `${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}`;
}

/**
 * 레시피 검색의 진입점. 네이버 검색 API 를 호출해 **정규화된 `RecipeType[]`** 로 반환한다.
 *
 * v1 의 요리 추천은 모델 내장 지식으로 하고, 이 검색은 사용자가 **"자세한 레시피 보여줘"**
 * 라고 요청했을 때만 붙는 보강 수단이다. 그래서 여기서 하는 일은 "글 목록 찾기"까지고,
 * 조리법 본문은 링크 너머에 있다(카드를 눌러 나간다).
 *
 * 벤더(네이버) 고유 형태(HTML `<b>` title, `bloggername`, `postdate`)와 호출 에러는 이 파일
 * 안에서 흡수한다 — `openai` 가 `llm/` 에, CLOVA 가 `ocr/` 에 갇히는 것과 같은 격리다.
 *
 * ⚠️ **실패하면 예외를 던진다.** 여기는 벤더 층이라 그게 맞다. 채팅에서 쓸 때는 호출자(실행기)가
 * 감싸서 "결과 없음 / 일시 실패 / 쿼터 소진"을 구분한 구조화 결과로 바꿔 모델에 넘긴다 —
 * 예외를 그대로 두면 세 상황이 한 문자열로 뭉개져 모델이 재시도 여부를 판단하지 못한다.
 */
@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);
  /** 네이버 오픈 API 자격증명 — 검색 API 전체가 같은 키를 쓴다(쇼핑·웹문서·블로그 공통) */
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('NAVER_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('NAVER_CLIENT_SECRET');
  }

  /**
   * 요리명으로 레시피 글을 찾는다.
   *
   * 질의어는 요리명 그대로가 아니라 **`"{요리명} 레시피"`** 다 — "김치찌개"만 넣으면 맛집·식당
   * 글이 섞이는데, 우리가 원하는 건 만드는 법이다.
   */
  async search(
    dishName: string,
    opts?: { source?: RecipeSourceType; limit?: number },
  ): Promise<RecipeSearchResultType> {
    const dish = dishName.trim();
    if (!dish) throw new BadRequestException('요리명이 필요합니다');

    const source: RecipeSourceType = opts?.source ?? 'naver_web';
    const limit = Math.min(NAVER_MAX_DISPLAY, Math.max(1, opts?.limit ?? DEFAULT_LIMIT));

    const items = await this.fetchNaver(NAVER_SERVICE[source], `${dish} 레시피`, limit);
    const recipes = items.map((it) => this.toRecipe(it, source));

    console.log('naver: ', JSON.stringify(items));
    console.log('정규화: ', JSON.stringify(recipes));

    this.logger.log(`레시피 검색 "${dish}" (${source}) → ${recipes.length}건`);
    return { dishName: dish, recipes };
  }

  /** 네이버 호출 — 벤더 에러는 여기서 잡아 의미있는 예외로 변환(바깥으로 안 샘) */
  private async fetchNaver(
    service: string,
    query: string,
    display: number,
  ): Promise<NaverSearchItem[]> {
    const url = new URL(`https://openapi.naver.com/v1/search/${service}.json`);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));
    // sort 는 넘기지 않는다 — 기본이 정확도순이고, 웹문서 검색은 지원 파라미터가 블로그와 달라
    // 괜히 넘기면 400 을 받을 수 있다.

    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`네이버 검색 오류 (${res.status}): ${body}`);
        throw new ServiceUnavailableException('레시피 검색에 실패했습니다');
      }
      const data = (await res.json()) as NaverSearchResponse;
      return data.items ?? [];
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error('네이버 검색 호출 실패', err as Error);
      throw new ServiceUnavailableException('레시피 검색에 실패했습니다');
    }
  }

  /** 네이버 raw → 정규화 RecipeType. 블로그에만 있는 필드는 있을 때만 채운다. */
  private toRecipe(it: NaverSearchItem, source: RecipeSourceType): RecipeType {
    const author = it.bloggername ? stripHtml(it.bloggername) : undefined;
    const publishedAt = toIsoDate(it.postdate);
    return {
      title: stripHtml(it.title),
      url: it.link,
      summary: stripHtml(it.description),
      source,
      sourceDomain: toDomain(it.link),
      ...(author ? { author } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };
  }
}
