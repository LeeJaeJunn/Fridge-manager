import type { TerminalToolCall } from '../llm/llm.service';
import { pickInventoryCall } from './conversation.service';

const call = (args: Record<string, unknown>, name = 'update_inventory'): TerminalToolCall => ({
  name,
  arguments: args,
});

describe('pickInventoryCall — 병렬 툴콜에서 첫 호출만 채택', () => {
  it('호출이 하나면 인자를 그대로 넘긴다', () => {
    const picked = pickInventoryCall([
      call({ add: [{ name: '계란' }], consume: [{ name: '대파', remaining: '1대' }] }),
    ]);

    expect(picked?.addItems).toEqual([{ name: '계란' }]);
    expect(picked?.consumeItems).toEqual([{ name: '대파', remaining: '1대' }]);
    expect(picked?.ignored).toBe(0);
  });

  it('여러 번 불리면 첫 호출만 쓰고 나머지는 버린다 (합치지 않는다)', () => {
    // 실제 관측된 모양: 2번째 호출이 1번째와 어긋나 같은 재고 행이 두 줄 올라왔다.
    const picked = pickInventoryCall([
      call({
        add: [{ name: '냉동갈치', quantityNote: '3마리' }],
        consume: [
          { name: '신라면', remaining: '2개' },
          { name: '진라면', remaining: '1개' },
        ],
      }),
      call({
        add: [{ name: '신라면', quantityNote: '3개' }],
        consume: [{ name: '진라면', remaining: '1개' }],
      }),
    ]);

    expect(picked?.addItems).toEqual([{ name: '냉동갈치', quantityNote: '3마리' }]);
    expect(picked?.consumeItems).toHaveLength(2);
    expect(picked?.ignored).toBe(1);
  });

  it('버린 호출 수를 ignored 로 알려준다 (경고 로그 근거)', () => {
    const picked = pickInventoryCall([call({ add: [] }), call({ add: [] }), call({ add: [] })]);
    expect(picked?.ignored).toBe(2);
  });

  it('다른 툴 호출은 세지 않는다', () => {
    const picked = pickInventoryCall([
      call({ keywords: '선풍기' }, 'search_products'),
      call({ add: [{ name: '계란' }] }),
    ]);

    expect(picked?.addItems).toEqual([{ name: '계란' }]);
    expect(picked?.ignored).toBe(0);
  });

  it('update_inventory 가 없거나 호출 자체가 없으면 undefined', () => {
    expect(pickInventoryCall(undefined)).toBeUndefined();
    expect(pickInventoryCall([])).toBeUndefined();
    expect(pickInventoryCall([call({ keywords: '선풍기' }, 'search_products')])).toBeUndefined();
  });

  it('인자가 배열이 아니면 없는 것으로 친다 (모델이 만든 JSON 을 믿지 않는다)', () => {
    const picked = pickInventoryCall([call({ add: '계란', consume: null })]);
    expect(picked?.addItems).toEqual([]);
    expect(picked?.consumeItems).toEqual([]);
  });
});
