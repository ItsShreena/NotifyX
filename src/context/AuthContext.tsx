import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeveloperUser, LoginDTO, SignupDTO } from '../types/auth';
import { authService } from '../services/authService';

interface AuthContextType {
  user: DeveloperUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (dto: LoginDTO) => Promise<void>;
  signup: (dto: SignupDTO) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<DeveloperUser | null>(null);
  const [token, setToken] = useState<string | null>(() => authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initAuth = async () => {
    setIsLoading(true);
    try {
      const activeUser = await authService.getMe();
      if (activeUser) {
        setUser(activeUser);
        setToken(authService.getToken());
      } else {
        setUser(null);
        setToken(null);
      }
    } catch (err) {
      console.warn('Auth init check error:', err);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (dto: LoginDTO) => {
    const res = await authService.login(dto);
    if (res.developer && res.token) {
      setUser(res.developer);
      setToken(res.token);
    }
  };

  const signup = async (dto: SignupDTO) => {
    const res = await authService.signup(dto);
    if (res.developer && res.token) {
      setUser(res.developer);
      setToken(res.token);
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setToken(null);
  };

  const refreshUser = async () => {
    const activeUser = await authService.getMe();
    setUser(activeUser);
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    isLoading,
    login,
    signup,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
