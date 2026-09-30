import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

export const API_TIMEOUT_MS = 15_000;
export const REQUEST_TIMEOUT_MESSAGE = "Przekroczono czas oczekiwania";

export type ApiRequestConfig = AxiosRequestConfig;

export class ApiTimeoutError extends Error {
  constructor() {
    super(REQUEST_TIMEOUT_MESSAGE);
    this.name = "ApiTimeoutError";
  }
}

export function isApiTimeoutError(error: unknown): boolean {
  return error instanceof ApiTimeoutError;
}

export function isRequestTimeout(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  if (error.code === AxiosError.ERR_CANCELED) {
    return false;
  }
  return error.code === AxiosError.ECONNABORTED || error.code === "ETIMEDOUT" || /timeout/i.test(error.message);
}

export function messageFromAxios(error: AxiosError): string {
  if (error.response?.status === 401) {
    return "Unauthorized";
  }
  const data = error.response?.data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return error.response?.statusText || "Request failed";
}

export function createHttpClient(notifyTimeout: (message: string) => void = () => {}): AxiosInstance {
  const http = axios.create({
    baseURL: "/api",
    timeout: API_TIMEOUT_MS,
    withCredentials: true,
    headers: {
      "Cache-Control": "no-store",
    },
  });

  http.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: unknown) => {
      if (isRequestTimeout(error)) {
        notifyTimeout(REQUEST_TIMEOUT_MESSAGE);
      }
      return Promise.reject(error);
    },
  );

  return http;
}

export async function request<T>(
  http: AxiosInstance,
  config: AxiosRequestConfig,
  override?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await http.request<T>({ ...config, ...override });
    if (response.status === 204) {
      return undefined as T;
    }
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === AxiosError.ERR_CANCELED) {
      throw error;
    }
    if (isRequestTimeout(error)) {
      throw new ApiTimeoutError();
    }
    if (axios.isAxiosError(error)) {
      throw new Error(messageFromAxios(error));
    }
    throw error instanceof Error ? error : new Error("Request failed");
  }
}
