import { cleanLlmText } from './sentinels';

/**
 * **실패가 조용한 자리라 고정한다.** 이 방어가 무너져도 서버는 잘 돌고 타입도 통과한다 —
 * 냉장고에 `"null"` 이라는 수량이 저장되고, 사용자가 화면에서 볼 때까지 아무도 모른다.
 * (실제로 두 번 겪었다: 스캔이 `없음` 을 저장했고, 소비 계산이 남은 양을 `"null"` 로 채웠다)
 */
describe('cleanLlmText', () => {
  it('의미 있는 값은 다듬어서 그대로 통과시킨다', () => {
    expect(cleanLlmText('  800g ')).toBe('800g');
    expect(cleanLlmText('반 통')).toBe('반 통');
  });

  it('모델이 문자열로 흘리는 "값 없음"을 걸러낸다', () => {
    // Structured Outputs 는 타입만 강제해서 이것들이 전부 유효한 string 으로 통과한다.
    for (const v of ['null', 'NULL', ' null ', 'none', 'N/A', 'undefined', '없음', '없다', '-']) {
      expect(cleanLlmText(v)).toBeUndefined();
    }
  });

  it('빈 값과 진짜 null 도 undefined 로 떨어뜨린다', () => {
    expect(cleanLlmText('')).toBeUndefined();
    expect(cleanLlmText('   ')).toBeUndefined();
    expect(cleanLlmText(null)).toBeUndefined();
    expect(cleanLlmText(undefined)).toBeUndefined();
  });

  it('"0" 은 값이다 — 빈 값으로 취급하면 안 된다', () => {
    // falsy 검사로 짧게 쓰면 여기서 깨진다("0개" 가 아니라 "0" 만 올 수도 있다).
    expect(cleanLlmText('0')).toBe('0');
  });
});
