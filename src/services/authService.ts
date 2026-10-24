import { AuthResponse, DeveloperUser, LoginDTO, SignupDTO } from '../types/auth';
import { getApiBaseUrl } from './urlConfig';

const TOKEN_KEY = 'notifyx_developer_jwt';

function getAuthUrl(path: string): string {
  const apiBase = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${cleanPath}` : cleanPath;
}

export const authService = {
  /**
   * Retrieves stored JWT token from localStorage
   */
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  /**
   * Saves JWT token to localStorage
   */
  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (err) {
      console.warn('Unable to persist auth token:', err);
    }
  },

  /**
   * Clears stored JWT token from localStorage
   */
  clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      console.warn('Unable to clear auth token:', err);
    }
  },

  /**
   * Registers a new developer account via POST /api/auth/signup
   */
  async signup(dto: SignupDTO): Promise<AuthResponse> {
    const res = await fetch(getAuthUrl('/api/auth/signup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    const data: AuthResponse = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create developer account');
    }

    if (data.token) {
      this.setToken(data.token);
    }

    return data;
  },

  /**
   * Authenticates developer credentials via POST /api/auth/login
   */
  async login(dto: LoginDTO): Promise<AuthResponse> {
    const res = await fetch(getAuthUrl('/api/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    const data: AuthResponse = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }

    if (data.token) {
      this.setToken(data.token);
    }

    return data;
  },

  /**
   * Validates the active session and retrieves authenticated developer profile via GET /api/auth/me
   */
  async getMe(): Promise<DeveloperUser | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(getAuthUrl('/api/auth/me'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        // Token is expired, invalid, or account deleted
        this.clearToken();
        return null;
      }

      const data = await res.json();
      return data.developer || null;
    } catch (err) {
      console.warn('Session verification network error:', err);
      return null;
    }
  },

  /**
   * Logs out the developer and clears local token
   */
  async logout(): Promise<void> {
    const token = this.getToken();
    try {
      if (token) {
        await fetch(getAuthUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      this.clearToken();
    }
  },
};
