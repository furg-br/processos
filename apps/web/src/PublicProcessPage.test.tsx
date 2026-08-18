import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { PublicProcessPage } from "./PublicProcessPage";
import * as api from "./api";

vi.mock("./api", async (loadOriginal) => ({ ...(await loadOriginal<typeof import("./api")>()), getProcessV2Projection: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("página pública isolada", () => {
  it("renderiza somente o acordeão curado de fases", async () => {
    vi.mocked(api.getProcessV2Projection).mockResolvedValue({
      process: { id: "p1", slug: "rsc", title: "RSC", description: "", ownerUnit: { acronym: "PROGEP", name: "Pró-Reitoria" } },
      version: { id: "v1", revision: 1, releaseId: "release-1" },
      projection: { title: "Como funciona o RSC", summary: "Acompanhamento público.", phases: [{ key: "fase-1", label: "Requerimento", description: "A pessoa prepara o pedido.", responsibleLabel: "Pessoa requerente", expectedDurationLabel: "Tempo do interessado", nextPhaseRefs: [] }] },
    });
    render(<PublicProcessPage locator="rsc" />);

    expect(await screen.findByRole("heading", { name: "Como funciona o RSC" })).toBeInTheDocument();
    expect(screen.getByText("Tempo esperado")).toBeInTheDocument();
    expect(screen.getByText("01 · Requerimento").closest("details")).toHaveAttribute("open");
    expect(screen.queryByText(/handler|endpoint|cron|perfil/i)).not.toBeInTheDocument();
    expect(api.getProcessV2Projection).toHaveBeenCalledWith("rsc", "PUBLIC");
    const accessibility = await axe.run(globalThis.document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  });
});
