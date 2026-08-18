import { describe, expect, it, vi } from "vitest";
import { fitBpmnCanvas } from "./BpmnCanvas";

describe("enquadramento inicial do BPMN", () => {
  it("preenche a altura útil e mantém o início do fluxo visível", () => {
    const viewbox = vi.fn()
      .mockReturnValueOnce({ inner: { height: 400, width: 2400, x: 100, y: 50 }, outer: { height: 800, width: 1200 } })
      .mockReturnValue(undefined);
    const zoom = vi.fn();
    fitBpmnCanvas({ resized: vi.fn(), viewbox, zoom }, "height");
    expect(zoom).not.toHaveBeenCalled();
    expect(viewbox).toHaveBeenLastCalledWith({ height: expect.closeTo(434.78, 1), width: expect.closeTo(652.17, 1), x: expect.closeTo(82.61, 1), y: expect.closeTo(32.61, 1) });
  });

  it("preserva o ajuste integral no editor", () => {
    const zoom = vi.fn();
    fitBpmnCanvas({ viewbox: vi.fn(), zoom }, "viewport");
    expect(zoom).toHaveBeenCalledWith("fit-viewport");
  });
});
