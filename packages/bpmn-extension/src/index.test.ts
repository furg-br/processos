import { describe, expect, it } from "vitest";
import { EMPTY_BPMN_XML, extractBpmnOutline, validateBpmnXml } from "./index";

describe("BPMN institucional", () => {
  it("extrai uma visão textual do diagrama", () => {
    const outline = extractBpmnOutline(EMPTY_BPMN_XML);
    expect(outline.map((item) => item.type)).toEqual(["startEvent", "endEvent", "task"]);
    expect(outline.find((item) => item.id === "Activity_1")?.name).toBe("Descrever a atividade");
  });

  it("considera válido o modelo inicial", () => {
    expect(validateBpmnXml(EMPTY_BPMN_XML)).toEqual([]);
  });
});
