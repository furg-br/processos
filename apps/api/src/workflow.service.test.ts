import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { WorkflowService } from "./workflow.service.js";

describe("WorkflowService", () => {
  const service = new WorkflowService();

  it("aplica a dupla aprovação", () => {
    expect(service.transition("DRAFT", "SUBMIT_UNIT")).toBe("UNIT_REVIEW");
    expect(service.transition("UNIT_REVIEW", "APPROVE_UNIT")).toBe("CURATOR_REVIEW");
    expect(service.transition("CURATOR_REVIEW", "APPROVE_CURATOR")).toBe("PUBLISHED");
  });

  it("impede publicação direta", () => {
    expect(() => service.transition("DRAFT", "APPROVE_CURATOR")).toThrow(BadRequestException);
  });

  it("expõe somente ações válidas para o estado atual", () => {
    expect(service.actions("UNIT_REVIEW")).toEqual(["APPROVE_UNIT", "REQUEST_CHANGES"]);
    expect(service.actions("ARCHIVED")).toEqual([]);
  });
});
