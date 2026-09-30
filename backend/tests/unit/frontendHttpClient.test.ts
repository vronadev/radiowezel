import { AxiosError, type InternalAxiosRequestConfig } from "../../../radiowezel-app/node_modules/axios/index.js";
import { describe, expect, it } from "vitest";
import {
  API_TIMEOUT_MS,
  ApiTimeoutError,
  createHttpClient,
  isRequestTimeout,
  request,
} from "../../../radiowezel-app/src/lib/httpClient.js";

function jsonResponse(config: InternalAxiosRequestConfig, status: number, data: unknown, statusText = "OK") {
  return {
    data,
    status,
    statusText,
    headers: {},
    config,
  };
}

describe("frontend http client", () => {
  it("defaults to a 15s timeout and the /api base URL", () => {
    const http = createHttpClient();
    expect(http.defaults.timeout).toBe(API_TIMEOUT_MS);
    expect(http.defaults.timeout).toBe(15_000);
    expect(http.defaults.baseURL).toBe("/api");
    expect(http.defaults.withCredentials).toBe(true);
  });

  it("toasts on ECONNABORTED and rejects with a timeout error", async () => {
    const notices: string[] = [];
    const http = createHttpClient((message) => notices.push(message));
    http.defaults.adapter = async (config) => {
      throw new AxiosError("timeout of 15000ms exceeded", AxiosError.ECONNABORTED, config);
    };

    await expect(request(http, { url: "/queue" })).rejects.toBeInstanceOf(ApiTimeoutError);
    expect(notices).toEqual(["Przekroczono czas oczekiwania"]);
  });

  it("treats a timeout message as a timeout even without ECONNABORTED", () => {
    const error = new AxiosError("timeout of 15000ms exceeded", "ERR_NETWORK");
    expect(isRequestTimeout(error)).toBe(true);
  });

  it("does not treat a canceled request as a timeout", async () => {
    const notices: string[] = [];
    const http = createHttpClient((message) => notices.push(message));
    http.defaults.adapter = async (config) => {
      throw new AxiosError("canceled", AxiosError.ERR_CANCELED, config);
    };

    await expect(request(http, { url: "/queue" })).rejects.toMatchObject({ code: AxiosError.ERR_CANCELED });
    expect(notices).toEqual([]);
  });

  it("keeps server error messages and does not toast them", async () => {
    const notices: string[] = [];
    const http = createHttpClient((message) => notices.push(message));
    http.defaults.adapter = async (config) => {
      throw new AxiosError("Request failed with status code 400", AxiosError.ERR_BAD_REQUEST, config, null, {
        data: { message: "Za dużo głosów" },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config,
      });
    };

    await expect(request(http, { url: "/vote", method: "POST" })).rejects.toThrow("Za dużo głosów");
    expect(notices).toEqual([]);
  });

  it("maps 401 to Unauthorized", async () => {
    const http = createHttpClient();
    http.defaults.adapter = async (config) => {
      throw new AxiosError("Request failed with status code 401", AxiosError.ERR_BAD_REQUEST, config, null, {
        data: { message: "session missing" },
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
      });
    };

    await expect(request(http, { url: "/auth/me" })).rejects.toThrow("Unauthorized");
  });

  it("lets a call override timeout and signal", async () => {
    const http = createHttpClient();
    const signal = new AbortController().signal;
    let seenTimeout = -1;
    let seenSignal: AbortSignal | undefined;
    http.defaults.adapter = async (config) => {
      seenTimeout = config.timeout ?? -1;
      seenSignal = config.signal;
      return jsonResponse(config, 200, { ok: true });
    };

    await request(http, { url: "/admin/playlists", method: "POST" }, { timeout: 60_000, signal });
    expect(seenTimeout).toBe(60_000);
    expect(seenSignal).toBe(signal);
  });
});
