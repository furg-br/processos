import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseLease, renewLease } from "./api";
import { EDIT_LEASE_RENEW_INTERVAL_MS, useEditLease } from "./useEditLease";

vi.mock("./api", () => ({
  releaseLease: vi.fn(() => Promise.resolve({ released: true })),
  renewLease: vi.fn(() => Promise.resolve({ token: "lease-token", expiresAt: new Date().toISOString() })),
}));

describe("ciclo do bloqueio de edição", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(releaseLease).mockClear();
    vi.mocked(renewLease).mockClear();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("renova o bloqueio ativo e o libera ao desmontar", async () => {
    const onExpired = vi.fn();
    const { unmount } = renderHook(() => useEditLease("lease-token", onExpired));

    await act(async () => { await vi.advanceTimersByTimeAsync(EDIT_LEASE_RENEW_INTERVAL_MS); });

    expect(renewLease).toHaveBeenCalledWith("lease-token");
    expect(onExpired).not.toHaveBeenCalled();

    unmount();
    expect(releaseLease).toHaveBeenCalledWith("lease-token");
  });

  it("informa a perda do bloqueio quando a renovação falha", async () => {
    vi.mocked(renewLease).mockRejectedValueOnce(new Error("O bloqueio expirou."));
    const onExpired = vi.fn();
    renderHook(() => useEditLease("lease-token", onExpired));

    await act(async () => { await vi.advanceTimersByTimeAsync(EDIT_LEASE_RENEW_INTERVAL_MS); });

    expect(onExpired).toHaveBeenCalledWith("O bloqueio expirou.");
  });
});
