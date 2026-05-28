"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  persistAuthSession,
  refreshTokens,
  register as apiRegister,
} from "@/lib/auth";
import { getAccessToken, getRefreshToken, getStoredUser, setStoredUser } from "@/lib/token";
import type { LoginRequest, RegisterRequest, User, UserRole } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Pick a sensible landing page for each role.
 *
 * Every authenticated role lands on `/dashboard`, which renders a role-tailored
 * overview (`DashboardPage`). Sub-views inside the dashboard link out to the
 * role's most relevant feature pages.
 */
export function defaultRouteForRole(role: UserRole | undefined): string {
  if (!role) return "/dashboard";
  return "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    let token = getAccessToken();
    if (!token && getRefreshToken()) {
      const renewed = await refreshTokens();
      token = renewed?.access_token ?? null;
    }
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { user: me } = await fetchMe();
      setUser(me);
      setStoredUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const cached = getStoredUser<User>();
    if (cached) setUser(cached);

    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = useCallback(
    async (payload: LoginRequest) => {
      const response = await apiLogin(payload);
      persistAuthSession(response);
      setUser(response.user);
      router.replace(defaultRouteForRole(response.user.role));
    },
    [router]
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      const response = await apiRegister(payload);
      persistAuthSession(response);
      setUser(response.user);
      router.replace(defaultRouteForRole(response.user.role));
    },
    [router]
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace("/");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
