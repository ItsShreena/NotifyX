export interface DeveloperAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicDeveloperProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface JwtAuthPayload {
  sub: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  developer?: PublicDeveloperProfile;
  error?: string;
  message?: string;
  code?: string;
}
