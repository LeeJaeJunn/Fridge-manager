import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { fieldsToText, type OcrFieldType } from './ocr.lines';

/** CLOVA OCR(General) 응답 — 벤더 원본. 이 파일 밖으로 새지 않게 여기서만 안다. */
interface ClovaResponse {
  images?: {
    inferResult?: string;
    message?: string;
    fields?: {
      inferText?: string;
      /** 이 조각에서 줄이 끝나는지 — 줄 복원의 주 신호 */
      lineBreak?: boolean;
      /** 꼭짓점(좌상단부터). lineBreak 가 없을 때 줄을 묶는 폴백에 쓴다 */
      boundingPoly?: { vertices?: { x: number; y: number }[] };
    }[];
  }[];
}

/** 이미지 한 장 — 스캔 경로가 넘기는 것과 같은 모양. */
export type OcrImageType = { buffer: Buffer; mimeType: string };

/**
 * OCR 진입점 — 이미지에서 **텍스트만** 뽑는다. 지금 구현은 NAVER CLOVA OCR(General).
 * 벤더 원본(필드 배열·좌표·신뢰도)과 호출 에러는 여기서 흡수하고, 소비처는 문자열 하나만 본다.
 *
 * ⚠️ **실패해도 예외를 던지지 않는다.** 키가 없거나 호출이 실패하면 빈 문자열을 돌려주고
 * 스캔은 이미지 단독으로 계속된다 — OCR 은 정확도를 올리는 보조 수단이지 필수 경로가 아니다.
 *
 * 조각을 그대로 이어붙이지 않고 **줄을 복원해서** 돌려준다 — 영수증은 `품명 ... 금액` 2단이라
 * 이어붙이면 열이 뒤섞여 모델이 품명과 금액을 잘못 짝짓는다. 복원 규칙은 순수 함수
 * `ocr.lines.ts`(`fieldsToText`, lineBreak 우선 / 좌표 폴백)가 소유한다.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly invokeUrl?: string;
  private readonly secret?: string;

  constructor(config: ConfigService) {
    // 선택 설정 — 없으면 OCR 을 건너뛴다(키 없이도 서버가 뜨고 CI 가 돈다).
    this.invokeUrl = config.get<string>('NAVER_OCR_INVOKE_URL');
    this.secret = config.get<string>('NAVER_OCR_SECRET');
  }

  /** 이미지 → 인식된 텍스트. 설정이 없거나 실패하면 빈 문자열. */
  async readText(image: OcrImageType): Promise<string> {
    if (!this.invokeUrl || !this.secret) {
      this.logger.warn('CLOVA OCR 미설정 — 이미지 단독으로 진행합니다.');
      return '';
    }

    try {
      const res = await fetch(this.invokeUrl, {
        method: 'POST',
        headers: {
          'X-OCR-SECRET': this.secret,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          version: 'V2',
          requestId: randomUUID(),
          timestamp: Date.now(),
          lang: 'ko',
          enableTableDetection: false,
          images: [
            {
              format: image.mimeType.includes('png') ? 'png' : 'jpg',
              name: 'scan',
              data: image.buffer.toString('base64'),
            },
          ],
        }),
      });

      if (!res.ok) {
        this.logger.warn(`CLOVA OCR 응답 오류 ${res.status} — 이미지 단독으로 진행합니다.`);
        return '';
      }

      const body = (await res.json()) as ClovaResponse;

      const first = body.images?.[0];
      if (first?.inferResult !== 'SUCCESS') {
        this.logger.warn(`CLOVA OCR 인식 실패 (${first?.inferResult ?? 'no result'})`);
        return '';
      }

      // 조각을 그대로 이어붙이면 `품명 ... 금액` 2단이 뒤섞여 모델이 열을 짚지 못한다.
      // 줄 복원은 순수 함수(ocr.lines.ts)가 맡는다 — 벤더가 바뀌어도 그대로 재사용된다.
      const fields: OcrFieldType[] = (first.fields ?? []).map((f) => ({
        text: f.inferText ?? '',
        lineBreak: f.lineBreak,
        y: f.boundingPoly?.vertices?.[0]?.y,
      }));
      const text = fieldsToText(fields);

      this.logger.log(
        `OCR 인식 ${fields.length}조각 → ${text ? text.split('\n').length : 0}줄, ${text.length}자`,
      );
      return text;
    } catch (err) {
      // 네트워크·JSON 파싱 등 — 스캔 자체를 죽이지 않는다.
      this.logger.warn(`CLOVA OCR 호출 실패 — 이미지 단독으로 진행합니다: ${String(err)}`);
      return '';
    }
  }
}
