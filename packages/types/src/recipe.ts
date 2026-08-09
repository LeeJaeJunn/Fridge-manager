/**
 * 레시피 검색 — 클라이언트↔서버 공유 계약.
 *
 * v1 의 요리 추천은 **모델 내장 지식**으로 한다(뭘 해먹을지 + 기본 조리법). 이 검색은
 * 사용자가 **"자세한 레시피 보여줘"라고 요청했을 때만** 붙는 보강 수단이다.
 * 그래서 여기 담기는 건 조리법 본문이 아니라 **바깥 글로 나가는 카드**다 —
 * 검색 API 가 주는 건 제목·링크·요약뿐이고 실제 레시피는 그 페이지에 있다.
 *
 * 벤더(네이버) 원본 모양(HTML `<b>` 태그, `bloggername`, `postdate`)은 서버
 * `recipe/recipe.service.ts` 안에서 흡수하고 소비처는 이 타입만 본다
 * (`llm/` 이 openai 를, `ocr/` 이 CLOVA 를 가두는 것과 같은 패턴).
 */

/**
 * 어느 네이버 검색으로 찾았는지.
 *
 * 기본은 `naver_web` 이다 — 실측에서 전문 레시피 사이트(만개의레시피·우리의테이블)가 잡히고
 * 요약에 재료 목록이 실려 오는 반면, `naver_blog` 는 제목·요약이 블로그 홍보 문구에 가까웠다.
 * 그래도 블로그를 남겨둔 건 요리에 따라 역전될 수 있어서고, 바꾸는 비용이 파라미터 하나라서다.
 */
export type RecipeSourceType = 'naver_web' | 'naver_blog';

/**
 * 레시피 링크 한 건 (카드 렌더용).
 *
 * 별도 `id` 를 두지 않는다 — `url` 이 곧 식별자다(같은 글이 두 번 오면 같은 카드).
 */
export interface RecipeType {
  /** 글 제목 (HTML 태그 제거됨) */
  title: string;
  /** 원문 주소 — 카드를 누르면 여기로 나간다 */
  url: string;
  /**
   * 검색 결과 요약 (HTML 태그 제거됨).
   * `naver_web` 은 여기에 재료 목록이 실려 오는 경우가 많아, 모델이 어느 글을 짚을지 고르는 근거가 된다.
   */
  summary: string;
  source: RecipeSourceType;
  /**
   * 출처 도메인 ("10000recipe.com"). 링크가 깨져 뽑지 못하면 빈 문자열.
   * **외부 콘텐츠임을 카드에서 드러내는 게 목적**이다 — 우리가 검증한 레시피가 아니다.
   */
  sourceDomain: string;
  /** 작성자 (블로그 검색에만 있음) */
  author?: string;
  /** 작성일 `YYYY-MM-DD` (블로그 검색에만 있음 — 원본은 `20260802` 형태) */
  publishedAt?: string;
}

/**
 * 레시피 검색 결과.
 *
 * `dishName` 을 함께 담는 이유: 이 결과는 나중에 툴 결과(`FUNCTION_CALL_OUTPUT.payload`)로
 * 저장돼 대화를 다시 열 때 그대로 렌더되는데, **어떤 요리를 찾은 카드인지**가 결과 안에 없으면
 * 카드 묶음만 덩그러니 남는다.
 */
export interface RecipeSearchResultType {
  /** 검색한 요리명 (호출자가 준 값 그대로) */
  dishName: string;
  recipes: RecipeType[];
}
