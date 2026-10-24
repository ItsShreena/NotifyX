/**
 * Core API Client for NotifyX.
 * Used for communicating with the Express backend (/api/*)
 * and future backend microservices.
 */

import { getApiBaseUrl } from './urlConfig';

export class ApiError extends Error {
  statusCode: number;
  data?: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Support external API host if configured and reachable, otherwise relative path
  const apiBase = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http')
    ? endpoint
    : apiBase
    ? `${apiBase}${cleanEndpoint}`
    : cleanEndpoint;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Automatically attach Bearer token if present
  try {
    const token = localStorage.getItem('notifyx_developer_jwt');
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // localStorage might be unavailable in certain sandbox environments
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new ApiError(
        `Request to ${endpoint} failed with status ${response.status}`,
        response.status,
        errorBody
      );
    }

    // If 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown network error',
      0,
      error
    );
  }
}
