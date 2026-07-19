import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import {
  deleteAccount as apiDeleteAccount,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
  updateMyName,
} from '@/api/auth';
import { onAuthExpired } from '@/api/auth-events';
import { ApiError } from '@/api/errors';
import { getAccessToken, getRefreshToken } from '@/api/token';
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
  /** 회원탈퇴 → 서버 계정 삭제 후 로컬 세션 내림 (실패 시 throw, 로그인 유지) */
  deleteAccount: () => Promise<void>;
  /** 내 이름 수정 → 전역 user 즉시 갱신 (홈 인사 등 반영) */
  updateName: (name: string) => Promise<void>;
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
      try {
        const [access, refresh] = await Promise.all([getAccessToken(), getRefreshToken()]);
        if (!access && !refresh) {
          setStatus('unauthenticated');
          return;
        }
        // 저장된 토큰으로 유저 확인. 401/403 = 세션 확정 만료(client 가 이미 토큰 정리),
        // 그 외(네트워크/5xx/토큰 갱신 일시 실패)는 로그아웃이 아니므로 몇 번 재시도한다.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            setUser(await fetchMe());
            setStatus('authenticated');
            return;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
              setUser(null);
              setStatus('unauthenticated');
              return;
            }
            if (attempt < 2) await delay(1200);
          }
        }
        // 재시도 후에도 일시 오류 → 토큰은 유지(다음 실행에서 복구), 일단 로그인 화면
        setStatus('unauthenticated');
      } catch {
        // SecureStore 읽기 실패 등 예기치 못한 오류에도 로딩을 반드시 끝낸다(스플래시가 안 닫히는 것 방지)
        setStatus('unauthenticated');
      }
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
    // 서버 로그아웃이 실패해도(서버 다운 등) 로컬 세션은 반드시 내린다.
    // (apiLogout 은 finally 에서 로컬 토큰을 이미 지운다)
    try {
      await apiLogout();
    } catch {
      // 무시: 상태 정리는 아래 finally 가 보장
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  const deleteAccount = async () => {
    // 서버 삭제가 성공해야 로컬 세션을 내린다 (apiDeleteAccount 가 성공 시에만 토큰을 지움).
    await apiDeleteAccount();
    setUser(null);
    setStatus('unauthenticated');
  };

  const updateName = async (name: string) => {
    setUser(await updateMyName({ name }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        isLoading: status === 'loading',
        login,
        signup,
        logout,
        deleteAccount,
        updateName,
      }}
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
