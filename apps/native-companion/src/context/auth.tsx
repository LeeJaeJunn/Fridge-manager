import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  deleteAccount as apiDeleteAccount,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
  updateMyName,
} from '@/api/auth';
import { onAuthExpired } from '@/api/auth-events';
import { getKakaoCode, kakaoLogin } from '@/api/social';
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
  /**
   * 카카오 로그인 — 가입/로그인이 갈리지 않는다. **서버가 셋 중 하나로 알아서 처리**한다:
   * 이미 카카오로 가입 → 로그인 / 같은 이메일 계정 있음 → 연결 / 처음 → 신규 가입.
   * 앱은 어느 쪽인지 알 필요가 없어서 함수도 하나다.
   */
  loginWithKakao: () => Promise<void>;
  logout: () => Promise<void>;
  /** 회원탈퇴 → 서버 계정 삭제 후 로컬 세션 내림 (실패 시 throw, 로그인 유지) */
  deleteAccount: () => Promise<void>;
  /**
   * 서버에서 유저를 다시 읽어 전역 상태를 맞춘다.
   *
   * ⚠️ **`User` 를 바꾸는 경로가 `PATCH /auth/me` 만이 아니라서 필요하다.** 온보딩은
   * `POST /characters` 로 `User.name` 을 쓰는데(같은 트랜잭션에 묶으려고), 그러면 서버만 바뀌고
   * 여기 캐시는 가입 시점의 `name: null` 로 남아 홈이 "안녕하세요, 님!" 이 된다 — 실제로 겪었다.
   * `User` 를 건드리는 경로를 새로 만들면 그 뒤에 이걸 부를 것.
   */
  refreshUser: () => Promise<void>;
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

  const loginWithKakao = async () => {
    // 브라우저 왕복(=code 획득)과 서버 교환을 나눠 둔 건 의도다 — 네이티브 SDK 로 갈아탈 때
    // 앞줄만 바뀐다(`api/social.ts` 참고).
    const code = await getKakaoCode();
    setUser(await kakaoLogin(code));
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

  // 안정 참조 — 온보딩이 effect/콜백에서 부를 수 있게 (참조가 흔들리면 effect 가 재등록된다).
  const refreshUser = useCallback(async () => {
    setUser(await fetchMe());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        isLoading: status === 'loading',
        login,
        signup,
        loginWithKakao,
        logout,
        deleteAccount,
        updateName,
        refreshUser,
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
