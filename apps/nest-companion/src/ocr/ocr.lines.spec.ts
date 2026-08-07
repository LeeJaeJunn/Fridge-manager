import { fieldsToText, type OcrFieldType } from './ocr.lines';

/** lineBreak 를 주는 조각 (Clova 가 실제로 주는 모양) */
const f = (text: string, lineBreak = false, y?: number): OcrFieldType => ({ text, lineBreak, y });
/** lineBreak 신호가 아예 없는 조각 (폴백 경로 검증용) */
const noBreak = (text: string, y: number): OcrFieldType => ({ text, y });

describe('fieldsToText — OCR 조각 → 줄', () => {
  describe('lineBreak 기반 (주 경로)', () => {
    it('lineBreak 에서 줄을 끊고 같은 줄은 공백으로 잇는다', () => {
      const text = fieldsToText([
        f('신라면멀티5입'),
        f('4,980'),
        f('1'),
        f('4,980', true),
        f('계란20구'),
        f('6,900', true),
      ]);
      expect(text).toBe('신라면멀티5입 4,980 1 4,980\n계란20구 6,900');
    });

    it('마지막 조각에 lineBreak 가 없어도 잃지 않는다', () => {
      const text = fieldsToText([f('합계', true), f('13,800')]);
      expect(text).toBe('합계\n13,800');
    });

    it('y 좌표가 있어도 lineBreak 를 우선한다 (벤더 신호가 더 정확)', () => {
      // y 는 제각각이지만 lineBreak 대로 두 줄이 되어야 한다
      const text = fieldsToText([f('두부', false, 10), f('2,500', true, 400), f('우유', true, 12)]);
      expect(text).toBe('두부 2,500\n우유');
    });
  });

  describe('y 좌표 폴백 (lineBreak 신호가 전혀 없을 때)', () => {
    it('세로 위치가 가까우면 같은 줄로 묶는다', () => {
      const text = fieldsToText([
        noBreak('신라면', 100),
        noBreak('4,980', 104),
        noBreak('계란', 160),
        noBreak('6,900', 158),
      ]);
      expect(text).toBe('신라면 4,980\n계란 6,900');
    });

    it('한 줄 안에서는 응답 순서를 유지한다 (영수증은 좌→우로 읽힌다)', () => {
      const text = fieldsToText([noBreak('품명', 50), noBreak('단가', 50), noBreak('수량', 50)]);
      expect(text).toBe('품명 단가 수량');
    });
  });

  describe('경계', () => {
    it('빈 배열이면 빈 문자열', () => {
      expect(fieldsToText([])).toBe('');
    });

    it('공백뿐인 조각은 버린다', () => {
      expect(fieldsToText([f('  ', true), f('두부', true)])).toBe('두부');
    });

    it('조각 앞뒤 공백을 정리한다', () => {
      expect(fieldsToText([f(' 두부 '), f(' 2,500 ', true)])).toBe('두부 2,500');
    });
  });
});
