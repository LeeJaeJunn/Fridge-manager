import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { fetchMe } from '@/api/auth';
import type { CurrentUserType } from '@companion/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  /** 현재 인증된 유저. dev 에서는 시드 유저다. */
  user: CurrentUserType | null;
  /** 로그인 기능이 붙으면 토큰 검증 결과까지 이 상태로 표현한다. */
  status: AuthStatus;
  isLoading: boolean;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 현재 유저 정보를 앱 전역으로 보관한다.
 * 지금은 /auth/me + dev auth 이고, 나중에 JWT 로그인/로그아웃을 여기로 확장한다.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<CurrentUserType | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refreshMe = async () => {
    setStatus('loading');
    try {
      setUser(await fetchMe());
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  useEffect(() => {
    // 마운트 시 1회 현재 유저 조회.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshMe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, isLoading: status === 'loading', refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
