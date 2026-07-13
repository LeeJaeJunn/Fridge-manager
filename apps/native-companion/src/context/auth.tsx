import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, signup as apiSignup } from '@/api/auth';
import { getAccessToken, getRefreshToken } from '@/api/token';
import type { CurrentUserType, LoginRequestType, SignupRequestType } from '@companion/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

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
    void (async () => {
      const [access, refresh] = await Promise.all([getAccessToken(), getRefreshToken()]);
      if (!access && !refresh) {
        setStatus('unauthenticated');
        return;
      }
      try {
        setUser(await fetchMe());
        setStatus('authenticated');
      } catch {
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
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
