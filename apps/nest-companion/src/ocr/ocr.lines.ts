/**
 * OCR 필드 → 사람이 읽는 줄글 (순수 — 벤더 SDK·HTTP 무관, `ocr.lines.spec.ts` 로 고정).
 *
 * 이 변환이 인식 품질을 크게 좌우한다. 영수증은 `품명 ......... 금액` 2단 레이아웃이라,
 * 필드를 받은 순서대로 이어붙이면 열이 뒤섞여 LLM 이 품명과 금액을 잘못 짝짓는다:
 *
 *   나쁨:  신라면  햇반  4,980  계란  3,280  6,900
 *   좋음:  신라면멀티5입   4,980
 *          CJ햇반210G*3   3,280
 */

/** OCR 한 조각 — 벤더 응답에서 필요한 것만 뽑은 중립 형태. */
export type OcrFieldType = {
  text: string;
  /** 이 조각에서 줄이 끝나는지 (벤더가 알려주는 경우) */
  lineBreak?: boolean;
  /** 조각의 세로 위치 — lineBreak 가 없을 때 줄을 묶는 근거 */
  y?: number;
};

/** y 가 이만큼 이내면 같은 줄로 본다(px). 영수증 글자 높이 기준의 경험값. */
const SAME_LINE_TOLERANCE = 12;

/**
 * 필드 목록 → 줄바꿈된 텍스트.
 *
 * **`lineBreak` 를 우선한다** — 벤더가 직접 알려주는 신호라 좌표 추론보다 정확하다.
 * 그 신호가 전혀 없으면(전부 false/undefined) y 좌표로 묶는 폴백을 쓴다.
 */
export function fieldsToText(fields: OcrFieldType[]): string {
  const usable = fields.filter((f) => f.text.trim().length > 0);
  if (usable.length === 0) return '';

  const hasLineBreak = usable.some((f) => f.lineBreak === true);
  const lines = hasLineBreak ? byLineBreak(usable) : byVerticalPosition(usable);

  return lines
    .map((line) => line.join(' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** 벤더가 준 줄 끝 신호로 자른다. */
function byLineBreak(fields: OcrFieldType[]): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  for (const field of fields) {
    current.push(field.text.trim());
    if (field.lineBreak === true) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * y 좌표가 가까운 것끼리 묶는다 (lineBreak 가 없을 때만).
 * 같은 줄 안에서는 원래 순서를 유지한다 — 영수증은 좌→우로 읽히므로 응답 순서가 대체로 맞다.
 */
function byVerticalPosition(fields: OcrFieldType[]): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let anchor: number | undefined;

  for (const field of fields) {
    const y = field.y;
    const isNewLine =
      typeof y === 'number' && typeof anchor === 'number'
        ? Math.abs(y - anchor) > SAME_LINE_TOLERANCE
        : false;

    if (isNewLine && current.length > 0) {
      lines.push(current);
      current = [];
    }
    current.push(field.text.trim());
    if (typeof y === 'number') anchor = y;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
