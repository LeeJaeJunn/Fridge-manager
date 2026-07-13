import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, signup as apiSignup } from '@/api/auth';
import { onAuthExpired } from '@/api/auth-events';
import { ApiError } from '@/api/errors';
import { clearTokens, getAccessToken, getRefreshToken } from '@/api/token';
import type { CurrentUserType, LoginRequestType, SignupRequestType } from '@companion/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type AuthContextValue = {
  /** 현재 인증된 유저 (미인증이면 null) */
  user: CurrentUserType | null;
  status: AuthStatus;
  isLoading: boolean;
  login: (body: LoginRequestType) => Promise<void>;
  signup: (body: SignupRequestType) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 인증 상태를 앱 전역으로 보관한다.
 * - 마운트 시 저장된 토큰이 있으면 /auth/me 로 유저를 확인한다(access 만료면 client 가 refresh 로 자동 복구).
 * - login/signup 은 토큰을 저장하고 유저를 세팅, logout 은 세션을 폐기한다.
 * 화면 분기는 이 status 를 보고 _layout 게이트가 처리한다(화면 내 수동 리다이렉트 금지).
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<CurrentUserType | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    // 사용 중 세션 사망(refresh 실패) 시 client 가 쏘는 이벤트 → 전역 인증 해제
    const unsubscribe = onAuthExpired(() => {
      setUser(null);
      setStatus('unauthenticated');
    });

    const bootstrap = async () => {
      const [access, refresh] = await Promise.all([getAccessToken(), getRefreshToken()]);
      if (!access && !refresh) {
        setStatus('unauthenticated');
        return;
      }
      // 저장된 토큰으로 유저 확인. 401/403 은 진짜 인증 해제지만,
      // 네트워크/서버 오류는 로그아웃이 아니므로 몇 번 재시도한다.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          setUser(await fetchMe());
          setStatus('authenticated');
          return;
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            await clearTokens();
            setUser(null);
            setStatus('unauthenticated');
            return;
          }
          if (attempt < 2) await delay(1200);
        }
      }
      // 재시도 후에도 네트워크/서버 오류 → 토큰은 유지(다음 실행에서 복구), 일단 로그인 화면
      setStatus('unauthenticated');
    };

    void bootstrap();
    return unsubscribe;
  }, []);

  const login = async (body: LoginRequestType) => {
    setUser(await apiLogin(body));
    setStatus('authenticated');
  };

  const signup = async (body: SignupRequestType) => {
    setUser(await apiSignup(body));
    setStatus('authenticated');
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setStatus('unauthenticated');
  };

  return (
    <AuthContext.Provider
      value={{ user, status, isLoading: status === 'loading', login, signup, logout }}
    >
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
