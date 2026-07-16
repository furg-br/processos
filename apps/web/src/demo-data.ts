import { EMPTY_BPMN_XML, extractBpmnOutline } from "@furg/processos-bpmn";
import type { ProcessDetail, ProcessSummary, SoftwareOperation } from "@furg/processos-contracts";

const owner = { id: "10000000-0000-4000-8000-000000000002", acronym: "CGTI", name: "Centro de Gestão de Tecnologia da Informação" };
const proiti = { id: "10000000-0000-4000-8000-000000000001", acronym: "PROITI", name: "Pró-Reitoria de Inovação e Tecnologia da Informação" };
const unit = { id: "10000000-0000-4000-8000-000000000004", acronym: "UNIDADE", name: "Unidade demandante" };

const definitions = [
  ["30000000-0000-4000-8000-000000000001", "solicitacao-desenvolvimento", "Solicitação de desenvolvimento de software", "Registra, qualifica e encaminha uma necessidade institucional de software.", "Gestão de demandas", "PUBLISHED", "AS_IS", 3, owner, [unit, proiti]],
  ["30000000-0000-4000-8000-000000000002", "priorizacao-demandas", "Priorização de demandas digitais", "Compara valor institucional, urgência, risco e capacidade antes de autorizar o trabalho.", "Governança digital", "PUBLISHED", "AS_IS", 2, proiti, [owner]],
  ["30000000-0000-4000-8000-000000000003", "desenvolvimento-homologacao", "Desenvolvimento e homologação", "Transforma uma demanda priorizada em incremento validado pela unidade responsável.", "Engenharia de software", "UNIT_REVIEW", "TO_BE", 1, owner, [unit]],
  ["30000000-0000-4000-8000-000000000004", "publicacao-producao", "Publicação em produção", "Coordena autorização, implantação, comunicação e verificação de uma entrega.", "Operação de serviços", "DRAFT", "TO_BE", 1, owner, [proiti]],
] as const;

export const demoProcesses: ProcessSummary[] = definitions.map(([id, slug, title, description, category, status, perspective, revision, ownerUnit, participantUnits]) => ({
  id, slug, title, description, category, audience: "Comunidade universitária e unidades da FURG", visibility: slug === "publicacao-producao" ? "INTERNAL" : "PUBLIC",
  ownerUnit, participantUnits: [...participantUnits], updatedAt: "2026-07-12T14:00:00.000Z",
  currentVersion: { id: id.replace("30000000", "40000000"), revision, status, perspective, createdAt: "2026-06-10T12:00:00.000Z", publishedAt: status === "PUBLISHED" ? "2026-06-20T12:00:00.000Z" : null },
}));

const relations = [
  { id: "70000000-0000-4000-8000-000000000001", sourceProcessId: demoProcesses[0]!.id, targetProcessId: demoProcesses[1]!.id, type: "PRECEDES" as const, label: "Demanda qualificada" },
  { id: "70000000-0000-4000-8000-000000000002", sourceProcessId: demoProcesses[1]!.id, targetProcessId: demoProcesses[2]!.id, type: "CALLS" as const, label: "Demanda priorizada" },
  { id: "70000000-0000-4000-8000-000000000003", sourceProcessId: demoProcesses[2]!.id, targetProcessId: demoProcesses[3]!.id, type: "PRECEDES" as const, label: "Incremento homologado" },
  { id: "70000000-0000-4000-8000-000000000004", sourceProcessId: demoProcesses[0]!.id, targetProcessId: demoProcesses[2]!.id, type: "EXCHANGES_INFORMATION" as const, label: "Requisitos e critérios" },
];

export const demoDetails: Record<string, ProcessDetail> = Object.fromEntries(demoProcesses.map((process, index) => [process.id, {
  ...process,
  bpmnXml: EMPTY_BPMN_XML.replace("Novo processo", process.title).replace("Descrever a atividade", ["Qualificar a necessidade", "Avaliar impacto institucional", "Detalhar o incremento", "Preparar a mudança"][index]!),
  processSla: ["P10D", "P20D", "P30D", "P5D"][index],
  continuous: false,
  versions: process.currentVersion ? [process.currentVersion] : [],
  relations: relations.filter((relation) => relation.sourceProcessId === process.id || relation.targetProcessId === process.id),
  outline: extractBpmnOutline(EMPTY_BPMN_XML.replace("Novo processo", process.title).replace("Descrever a atividade", ["Qualificar a necessidade", "Avaliar impacto institucional", "Detalhar o incremento", "Preparar a mudança"][index]!)),
  elementMetadata: index === 0 ? [{
    bpmnElementId: "Activity_1", role: "Analista de negócio", organizationUnitId: null,
    workDuration: "PT4H", waitDuration: "P2D", softwareBindings: [], dataBindings: [],
  }] : [],
}]));

export const demoRelations = relations;

export const demoOperations: SoftwareOperation[] = [{
  id: "50000000-0000-4000-8000-000000000004", system: "Sistemas FURG", module: "Demandas de software",
  functionality: "Registro de demandas", operationId: "registrarDemanda", method: "POST", path: "/demandas", version: "1.0.0",
}];

export const demoSchemas = [{
  id: "60000000-0000-4000-8000-000000000002", assetId: "60000000-0000-4000-8000-000000000001", name: "Demanda de software", version: 1,
  visibility: "PUBLIC" as const, createdAt: "2026-06-20T12:00:00.000Z",
  jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "Demanda de software", type: "object", required: ["titulo", "problema", "unidadeDemandante"], properties: { titulo: { type: "string" }, problema: { type: "string" }, unidadeDemandante: { type: "string" } } },
}];
