import type { BpmnOutlineElement } from "@furg/processos-contracts";
import BpmnModdle from "bpmn-moddle";
import { XMLParser } from "fast-xml-parser";

export const furgModdleDescriptor = {
  name: "FURG",
  uri: "https://processos.furg.br/schema/bpmn/furg/1.0",
  prefix: "furg",
  xml: { tagAlias: "lowerCase" },
  types: [
    {
      name: "BindingRef",
      superClass: ["Element"],
      properties: [
        { name: "kind", isAttr: true, type: "String" },
        { name: "ref", isAttr: true, type: "String" },
      ],
    },
  ],
};

export const EMPTY_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:furg="https://processos.furg.br/schema/bpmn/furg/1.0"
  id="Definitions_FURG" targetNamespace="https://processos.furg.br/bpmn">
  <bpmn:process id="Process_FURG" name="Novo processo" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Início">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Descrever a atividade">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Resultado entregue">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_FURG">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="170" y="172" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="270" y="150" width="130" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="470" y="172" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="206" y="190" /><di:waypoint x="270" y="190" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="400" y="190" /><di:waypoint x="470" y="190" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => [
    "process", "collaboration", "participant", "lane", "startEvent", "endEvent",
    "intermediateCatchEvent", "intermediateThrowEvent", "task", "userTask", "serviceTask",
    "manualTask", "businessRuleTask", "sendTask", "receiveTask", "scriptTask", "callActivity",
    "subProcess", "exclusiveGateway", "inclusiveGateway", "parallelGateway", "eventBasedGateway",
    "dataObjectReference", "dataStoreReference", "sequenceFlow", "incoming", "outgoing",
  ].includes(name),
});

const elementTypes = [
  "participant", "lane", "startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent",
  "task", "userTask", "serviceTask", "manualTask", "businessRuleTask", "sendTask", "receiveTask",
  "scriptTask", "callActivity", "subProcess", "exclusiveGateway", "inclusiveGateway", "parallelGateway",
  "eventBasedGateway", "dataObjectReference", "dataStoreReference",
] as const;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function collect(container: Record<string, unknown>, parentId?: string): BpmnOutlineElement[] {
  const elements: BpmnOutlineElement[] = [];
  for (const type of elementTypes) {
    for (const raw of asArray(container[type] as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const id = String(raw["@_id"] ?? "");
      if (!id) continue;
      elements.push({
        id,
        type,
        name: String(raw["@_name"] ?? defaultName(type)),
        parentId: parentId ?? null,
        incoming: asArray(raw.incoming as string | string[] | undefined).map(String),
        outgoing: asArray(raw.outgoing as string | string[] | undefined).map(String),
      });
      if (type === "subProcess") elements.push(...collect(raw, id));
    }
  }
  return elements;
}

function defaultName(type: string) {
  const labels: Record<string, string> = {
    startEvent: "Início sem nome",
    endEvent: "Fim sem nome",
    exclusiveGateway: "Decisão sem nome",
    inclusiveGateway: "Decisão inclusiva sem nome",
    parallelGateway: "Paralelismo sem nome",
    eventBasedGateway: "Evento sem nome",
  };
  return labels[type] ?? "Elemento sem nome";
}

export function extractBpmnOutline(xml: string): BpmnOutlineElement[] {
  const document = parser.parse(xml) as { definitions?: Record<string, unknown> };
  const definitions = document.definitions;
  if (!definitions) throw new Error("O arquivo não contém uma definição BPMN 2.0.");
  return asArray(definitions.process as Record<string, unknown> | Record<string, unknown>[] | undefined)
    .flatMap((process) => collect(process, String(process["@_id"] ?? "") || undefined));
}

export type BpmnValidationIssue = {
  code: string;
  elementId?: string;
  severity: "error" | "warning";
  message: string;
};

export function validateBpmnXml(xml: string, continuous = false): BpmnValidationIssue[] {
  let outline: BpmnOutlineElement[];
  try {
    outline = extractBpmnOutline(xml);
  } catch (error) {
    return [{ code: "invalid-xml", severity: "error", message: error instanceof Error ? error.message : "BPMN inválido." }];
  }
  const issues: BpmnValidationIssue[] = [];
  if (!outline.some((item) => item.type === "startEvent")) {
    issues.push({ code: "missing-start", severity: "error", message: "Inclua ao menos um evento de início." });
  }
  if (!outline.some((item) => item.type === "endEvent")) {
    issues.push({
      code: "missing-end",
      severity: continuous ? "warning" : "error",
      message: continuous
        ? "Processo contínuo sem fim explícito: documente como cada ocorrência é encerrada."
        : "Inclua ao menos um evento de fim.",
    });
  }
  for (const element of outline) {
    if (["task", "userTask", "serviceTask", "manualTask", "businessRuleTask", "callActivity", "subProcess"].includes(element.type)
      && element.name === "Elemento sem nome") {
      issues.push({ code: "unnamed-activity", elementId: element.id, severity: "error", message: "Toda atividade deve ter um nome orientado à ação." });
    }
    if (element.type.endsWith("Gateway") && element.name.includes("sem nome")) {
      issues.push({ code: "unnamed-gateway", elementId: element.id, severity: "warning", message: "Nomeie o gateway como a pergunta que orienta a decisão." });
    }
  }
  return issues;
}

/** Valida o XML pelo metamodelo BPMN 2.0 além das regras editoriais FURG. */
export async function validateBpmnModel(xml: string, continuous = false): Promise<BpmnValidationIssue[]> {
  const issues = validateBpmnXml(xml, continuous);
  if (issues.some((issue) => issue.code === "invalid-xml")) return issues;
  try {
    const moddle = new BpmnModdle({ furg: furgModdleDescriptor });
    const result = await moddle.fromXML(xml, "bpmn:Definitions");
    if (result.rootElement?.$type !== "bpmn:Definitions") {
      issues.push({ code: "invalid-root", severity: "error", message: "O elemento raiz deve ser bpmn:Definitions." });
    }
    if (!result.rootElement?.rootElements?.length) {
      issues.push({ code: "missing-root-element", severity: "error", message: "A definição BPMN não contém processo ou colaboração." });
    }
    for (const warning of result.warnings ?? []) issues.push({ code: "metamodel-warning", severity: "warning", message: warning.message });
  } catch (error) {
    issues.push({ code: "metamodel-invalid", severity: "error", message: error instanceof Error ? error.message : "O XML não é compatível com o metamodelo BPMN 2.0." });
  }
  return issues;
}

export function diffBpmn(previousXml: string, nextXml: string) {
  const previous = new Map(extractBpmnOutline(previousXml).map((element) => [element.id, element]));
  const next = new Map(extractBpmnOutline(nextXml).map((element) => [element.id, element]));
  const added = [...next.keys()].filter((id) => !previous.has(id));
  const removed = [...previous.keys()].filter((id) => !next.has(id));
  const changed = [...next.keys()].filter((id) => {
    const before = previous.get(id);
    const after = next.get(id);
    return before && after && JSON.stringify(before) !== JSON.stringify(after);
  });
  return { added, removed, changed };
}
