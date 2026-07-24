import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  addIngredients,
  consumeIngredient,
  fetchInventory,
  fetchInventoryOptions,
  removeIngredient,
  restoreIngredient,
  updateIngredient,
} from '@/api/inventory';
import { useAuth } from '@/context/auth';
import { shouldNudge } from '@/lib/expiry';
import type {
  AddIngredientInputType,
  IngredientType,
  InventoryOptionsType,
  UpdateIngredientRequestType,
} from '@companion/types';

type InventoryContextValue = {
  /** 안 먹은 재고 전부 — 항상 임박순 정렬 유지 */
  items: IngredientType[];
  /** 곧 먹어야 할 것 (오늘까지·지남) — items 에서 파생 */
  expiring: IngredientType[];
  /** 카테고리·보관위치 라벨 + 입력 제한 (세션에 한 번 로드) */
  options: InventoryOptionsType | null;
  isLoading: boolean;
  error: string | null;
  /** 서버에서 다시 불러오기 (채팅으로 재고가 바뀐 뒤 등) */
  refresh: () => Promise<void>;
  add: (input: AddIngredientInputType[]) => Promise<void>;
  update: (id: string, patch: UpdateIngredientRequestType) => Promise<void>;
  /** 다 먹음 (soft delete — restore 로 되돌릴 수 있음) */
  consume: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** 완전 삭제 (잘못 등록 — 되돌리기 없음) */
  remove: (id: string) => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

const sortByExpiry = (list: IngredientType[]): IngredientType[] =>
  [...list].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

/**
 * 현재 유저의 냉장고 재고를 앱 전역으로 보관한다.
 * 홈·냉장고·채팅이 같은 목록·같은 갱신 함수를 쓰므로, 한 화면의 변경이 곧바로 전 화면에 반영된다.
 * (예전엔 화면마다 따로 fetch·따로 state 라 냉장고에서 소비해도 홈은 포커스 전까지 어긋났다.)
 *
 * 진실원천이 여기 하나라, 화면은 focus 마다 새로고침하지 않고 그냥 구독만 한다.
 * 재고를 서버가 바꾸는 유일한 경로(채팅 tool-use) 뒤에만 refresh() 를 부르면 된다.
 */
export function InventoryProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [items, setItems] = useState<IngredientType[]>([]);
  const [options, setOptions] = useState<InventoryOptionsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 안정 참조 — 채팅 화면이 언마운트 effect 에서 이 함수를 부른다(참조가 흔들리면 effect 가 재등록된다).
  const refresh = useCallback(async () => {
    try {
      const list = await fetchInventory();
      setItems(sortByExpiry(list));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '재고를 불러오지 못했어요');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOptions = async () => {
    try {
      setOptions(await fetchInventoryOptions());
    } catch {
      // 선택지는 폼에서만 쓰이므로 실패해도 목록은 보여준다.
    }
  };

  const reset = () => {
    setItems([]);
    setOptions(null);
    setIsLoading(false);
    setError(null);
  };

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      // effect 본문에서 동기 setState 를 피한다(cascading render 규칙).
      void Promise.resolve().then(reset);
      return;
    }
    void Promise.resolve().then(async () => {
      await Promise.all([refresh(), loadOptions()]);
    });
  }, [status, refresh]);

  // ── mutations: 낙관적 갱신 + 서버 반영. 소비/삭제는 즉시 빼서 반응성을 준다. ──

  const add = async (input: AddIngredientInputType[]) => {
    // 병합(같은 이름) 가능성이 있어 서버 응답 뒤 목록 전체를 다시 맞추는 게 안전하다.
    await addIngredients(input);
    await refresh();
  };

  const update = async (id: string, patch: UpdateIngredientRequestType) => {
    const updated = await updateIngredient(id, patch);
    setItems((prev) => sortByExpiry(prev.map((i) => (i.id === id ? updated : i))));
  };

  const consume = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await consumeIngredient(id);
    } catch {
      await refresh(); // 실패하면 서버 상태로 되돌린다
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await removeIngredient(id);
    } catch {
      await refresh();
    }
  };

  const restore = async (id: string) => {
    // 되돌린 항목의 최신 상태(만료일 등)를 알 수 없으니 서버에서 다시 받는다.
    await restoreIngredient(id);
    await refresh();
  };

  const expiring = items.filter(shouldNudge);

  return (
    <InventoryContext.Provider
      value={{
        items,
        expiring,
        options,
        isLoading,
        error,
        refresh,
        add,
        update,
        consume,
        restore,
        remove,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error('useInventory 는 InventoryProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
