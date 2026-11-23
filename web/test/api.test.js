import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/keyStore.js", () => ({
  clearHouseholdKey: vi.fn(async () => {}),
}));

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Resolves once pending microtasks/handlers have run, without waiting on a
// promise that may never settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

let fetchMock;
let replaceMock;
let api;

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  replaceMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "sessionStorage",
    makeStorage({
      accessToken: "old-token",
      csrfToken: "csrf-1",
      userEmail: "parent@example.com",
    }),
  );
  vi.stubGlobal("window", { location: { replace: replaceMock } });
  vi.stubGlobal("document", { cookie: "" });
  ({ api } = await import("../src/lib/api.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request() on an expired access token", () => {
  it("refreshes once and retries with the new token", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(200, {
          accessToken: "new-token",
          csrfToken: "csrf-2",
          user: { email: "parent@example.com", is_super_admin: false },
        });
      }
      return init.headers.Authorization === "Bearer new-token"
        ? jsonResponse(200, { kids: [{ id: "k1" }] })
        : jsonResponse(401, { error: "Unauthorized" });
    });

    await expect(api.getKids()).resolves.toEqual({ kids: [{ id: "k1" }] });
    expect(sessionStorage.getItem("accessToken")).toBe("new-token");
    expect(sessionStorage.getItem("csrfToken")).toBe("csrf-2");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shares a single refresh across parallel requests", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(200, { accessToken: "new-token" });
      }
      return init.headers.Authorization === "Bearer new-token"
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: "Unauthorized" });
    });

    await Promise.all([api.getKids(), api.getChores(), api.getHousehold()]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      url.endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("redirects to /login exactly once and never settles when refresh fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

    const settled = vi.fn();
    for (const call of [api.getKids(), api.getChores(), api.getHousehold()]) {
      call.then(settled, settled);
    }
    await flush();
    await flush();

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("userEmail")).toBeNull();
    // Callers must not get a rejection to render as an error message.
    expect(settled).not.toHaveBeenCalled();
  });

  it("still throws non-401 errors normally", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: "Admin mode required." }),
    );
    await expect(api.getKids()).rejects.toThrow("Admin mode required.");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("surfaces a 401 from login without refreshing or redirecting", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: "Invalid email or password." }),
    );
    await expect(
      api.login({ email: "a@example.com", password: "x" }),
    ).rejects.toThrow("Invalid email or password.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
