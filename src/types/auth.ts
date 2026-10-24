export interface DeveloperUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  developer?: DeveloperUser;
  error?: string;
  message?: string;
  code?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface SignupDTO {
  name: string;
  email: string;
  password: string;
}
