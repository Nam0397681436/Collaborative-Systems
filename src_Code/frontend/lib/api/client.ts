import axios, { AxiosError, type AxiosInstance } from "axios"

export type ApiError = {
  message: string
  status?: number
  data?: unknown
}

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api"

function normalizeApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; detail?: string }>
    return {
      message:
        axiosError.response?.data?.message ??
        axiosError.response?.data?.detail ??
        axiosError.message ??
        "Request failed",
      status: axiosError.response?.status,
      data: axiosError.response?.data,
    }
  }

  return {
    message: error instanceof Error ? error.message : "Unknown error",
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error))
)

export function getApiBaseUrl() {
  return baseURL
}
