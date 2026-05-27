import { apiClient } from "./client"

export interface AuthUser {
  id: string
  username: string
  email: string
}

export interface AuthApiResponse {
  success: boolean
  message?: string
  data?: {
    user: AuthUser
  }
}

export async function loginApi(email: string, password: string): Promise<AuthApiResponse> {
  const res = await apiClient.post<AuthApiResponse>(`/auth/login`, { email, password })
  return res.data
}

export async function registerApi(email: string, username: string, password: string): Promise<AuthApiResponse> {
  const res = await apiClient.post<AuthApiResponse>(`/auth/register`, { email, username, password })
  return res.data
}
