import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { fetchMyCharacter } from '@/api/character';
import { useAuth } from '@/context/auth';
import type { CharacterType } from '@companion/types';

type CharacterContextValue = {
  /** 내 캐릭터 (아직 안 만들었으면 null) */
  character: CharacterType | null;
  /** 첫 조회 진행 중인지 — 게이트가 깜빡이지 않게 하는 데 사용 */
  isLoading: boolean;
  /** 서버에서 다시 불러오기 */
  refresh: () => Promise<void>;
  /** 생성·수정 후 즉시 반영 (게이트/화면 갱신) */
  setCharacter: (c: CharacterType | null) => void;
};

const CharacterContext = createContext<CharacterContextValue | null>(null);

/**
 * 현재 유저의 캐릭터를 앱 전역으로 보관한다 (세션성 상태라 Context로 충분).
 * 앱 시작 시 한 번 불러오고, 온보딩/프로필에서 갱신한다.
 */
export function CharacterProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [character, setCharacter] = useState<CharacterType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    try {
      setCharacter(await fetchMyCharacter());
    } catch {
      setCharacter(null);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setCharacter(null);
    setIsLoading(false);
  };

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated') {
      void Promise.resolve().then(reset);
      return;
    }

    // 인증된 뒤에만 내 캐릭터를 조회한다.
    void Promise.resolve().then(refresh);
  }, [status]);

  return (
    <CharacterContext.Provider value={{ character, isLoading, refresh, setCharacter }}>
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const ctx = useContext(CharacterContext);
  if (!ctx) {
    throw new Error('useCharacter 는 CharacterProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
