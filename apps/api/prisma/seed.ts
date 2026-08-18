import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const ids = {
  proiti: "10000000-0000-4000-8000-000000000001",
  cgti: "10000000-0000-4000-8000-000000000002",
  proplad: "10000000-0000-4000-8000-000000000003",
  unit: "10000000-0000-4000-8000-000000000004",
  progep: "10000000-0000-4000-8000-000000000005",
  crsc: "10000000-0000-4000-8000-000000000006",
  taxonomy: "20000000-0000-4000-8000-000000000001",
  intake: "30000000-0000-4000-8000-000000000001",
  priority: "30000000-0000-4000-8000-000000000002",
  delivery: "30000000-0000-4000-8000-000000000003",
  release: "30000000-0000-4000-8000-000000000004",
  intakeVersion: "40000000-0000-4000-8000-000000000001",
  priorityVersion: "40000000-0000-4000-8000-000000000002",
  deliveryVersion: "40000000-0000-4000-8000-000000000003",
  releaseVersion: "40000000-0000-4000-8000-000000000004",
  system: "50000000-0000-4000-8000-000000000001",
  module: "50000000-0000-4000-8000-000000000002",
  functionality: "50000000-0000-4000-8000-000000000003",
  operation: "50000000-0000-4000-8000-000000000004",
  asset: "60000000-0000-4000-8000-000000000001",
  schema: "60000000-0000-4000-8000-000000000002",
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function makeBpmn(processId: string, processName: string, first: string, decision: string, approved: string, rejected: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:furg="https://processos.furg.br/schema/bpmn/furg/1.0" id="Definitions_${processId}" targetNamespace="https://processos.furg.br/bpmn">
  <bpmn:process id="${processId}" name="${processName}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Demanda recebida"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Activity_Receive" name="${first}"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_Decision" name="${decision}"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing><bpmn:outgoing>Flow_4</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:userTask id="Activity_Approve" name="${approved}"><bpmn:incoming>Flow_3</bpmn:incoming><bpmn:outgoing>Flow_5</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EndEvent_Approved" name="Resultado disponibilizado"><bpmn:incoming>Flow_5</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="EndEvent_Rejected" name="${rejected}"><bpmn:incoming>Flow_4</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_Receive" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_Receive" targetRef="Gateway_Decision" />
    <bpmn:sequenceFlow id="Flow_3" name="Sim" sourceRef="Gateway_Decision" targetRef="Activity_Approve" />
    <bpmn:sequenceFlow id="Flow_4" name="Não" sourceRef="Gateway_Decision" targetRef="EndEvent_Rejected" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Activity_Approve" targetRef="EndEvent_Approved" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="150" y="202" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Activity_Receive_di" bpmnElement="Activity_Receive"><dc:Bounds x="240" y="180" width="130" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Gateway_Decision_di" bpmnElement="Gateway_Decision" isMarkerVisible="true"><dc:Bounds x="430" y="195" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Activity_Approve_di" bpmnElement="Activity_Approve"><dc:Bounds x="540" y="110" width="140" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_Approved_di" bpmnElement="EndEvent_Approved"><dc:Bounds x="750" y="132" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_Rejected_di" bpmnElement="EndEvent_Rejected"><dc:Bounds x="592" y="292" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="186" y="220" /><di:waypoint x="240" y="220" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="370" y="220" /><di:waypoint x="430" y="220" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="455" y="195" /><di:waypoint x="455" y="150" /><di:waypoint x="540" y="150" /><bpmndi:BPMNLabel><dc:Bounds x="468" y="126" width="20" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="455" y="245" /><di:waypoint x="455" y="310" /><di:waypoint x="592" y="310" /><bpmndi:BPMNLabel><dc:Bounds x="472" y="286" width="23" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="680" y="150" /><di:waypoint x="750" y="150" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function main() {
  await prisma.auditEvent.deleteMany();
  await prisma.editLease.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.dataBinding.deleteMany();
  await prisma.elementBinding.deleteMany();
  await prisma.processRelation.deleteMany();
  await prisma.processUnit.deleteMany();
  await prisma.processVersion.deleteMany();
  await prisma.process.deleteMany();
  await prisma.informationSchemaVersion.deleteMany();
  await prisma.informationAsset.deleteMany();
  await prisma.softwareOperation.deleteMany();
  await prisma.functionality.deleteMany();
  await prisma.systemModule.deleteMany();
  await prisma.softwareSystem.deleteMany();
  await prisma.taxonomy.deleteMany();
  await prisma.organizationUnitReference.deleteMany();
  await prisma.organizationUnit.deleteMany();

  await prisma.organizationUnit.createMany({ data: [
    { id: ids.proiti, externalId: "FURG-PROITI", acronym: "PROITI", name: "Pró-Reitoria de Inovação e Tecnologia da Informação" },
    { id: ids.cgti, externalId: "FURG-CGTI", acronym: "CGTI", name: "Centro de Gestão de Tecnologia da Informação", parentId: ids.proiti },
    { id: ids.proplad, externalId: "FURG-PROPLAD", acronym: "PROPLAD", name: "Pró-Reitoria de Planejamento e Administração" },
    { id: ids.unit, externalId: "FURG-UNIDADE", acronym: "UNIDADE", name: "Unidade demandante" },
    { id: ids.progep, externalId: "FURG-PROGEP", acronym: "PROGEP", name: "Pró-Reitoria de Gestão e Desenvolvimento de Pessoas" },
    { id: ids.crsc, externalId: "FURG-CRSC", acronym: "CRSC", name: "Comissão RSC-PCCTAE", parentId: ids.progep },
  ] });
  await prisma.organizationUnitReference.createMany({ data: [
    { unitId: ids.proiti, sourceSystem: "PROCESS_BUNDLE_V2", reference: "unidade.proiti" },
    { unitId: ids.cgti, sourceSystem: "PROCESS_BUNDLE_V2", reference: "unidade.cgti" },
    { unitId: ids.proplad, sourceSystem: "PROCESS_BUNDLE_V2", reference: "unidade.proplad" },
    { unitId: ids.progep, sourceSystem: "PROCESS_BUNDLE_V2", reference: "unidade.progep" },
    { unitId: ids.crsc, sourceSystem: "PROCESS_BUNDLE_V2", reference: "unidade.comissao.rsc" },
  ] });
  await prisma.taxonomy.create({ data: { id: ids.taxonomy, name: "Transformação digital", slug: "transformacao-digital" } });

  const processes = [
    {
      id: ids.intake, slug: "solicitacao-desenvolvimento", title: "Solicitação de desenvolvimento de software",
      description: "Registra, qualifica e encaminha uma necessidade institucional de software.", category: "Gestão de demandas", audience: "Unidades acadêmicas e administrativas",
      ownerUnitId: ids.cgti, participantIds: [ids.unit, ids.proiti], versionId: ids.intakeVersion, revision: 3, status: "PUBLISHED" as const, perspective: "AS_IS" as const,
      bpmn: makeBpmn("Process_Intake", "Solicitação de desenvolvimento", "Qualificar a necessidade", "Há informação suficiente?", "Registrar a demanda", "Complementação solicitada"), sla: "P10D",
    },
    {
      id: ids.priority, slug: "priorizacao-demandas", title: "Priorização de demandas digitais",
      description: "Compara valor institucional, urgência, risco e capacidade antes de autorizar o trabalho.", category: "Governança digital", audience: "Gestores e comitês de priorização",
      ownerUnitId: ids.proiti, participantIds: [ids.cgti, ids.proplad], versionId: ids.priorityVersion, revision: 2, status: "PUBLISHED" as const, perspective: "AS_IS" as const,
      bpmn: makeBpmn("Process_Priority", "Priorização de demandas", "Avaliar impacto institucional", "A demanda é prioritária?", "Aprovar a priorização", "Demanda permanece no portfólio"), sla: "P20D",
    },
    {
      id: ids.delivery, slug: "desenvolvimento-homologacao", title: "Desenvolvimento e homologação",
      description: "Transforma uma demanda priorizada em incremento validado pela unidade responsável.", category: "Engenharia de software", audience: "Equipes de produto e unidades homologadoras",
      ownerUnitId: ids.cgti, participantIds: [ids.unit], versionId: ids.deliveryVersion, revision: 1, status: "UNIT_REVIEW" as const, perspective: "TO_BE" as const,
      bpmn: makeBpmn("Process_Delivery", "Desenvolvimento e homologação", "Detalhar o incremento", "O incremento atende aos critérios?", "Homologar o incremento", "Ajustes de desenvolvimento solicitados"), sla: "P30D",
    },
    {
      id: ids.release, slug: "publicacao-producao", title: "Publicação em produção",
      description: "Coordena autorização, implantação, comunicação e verificação de uma entrega.", category: "Operação de serviços", audience: "Equipes técnicas e responsáveis pelo serviço",
      ownerUnitId: ids.cgti, participantIds: [ids.proiti], versionId: ids.releaseVersion, revision: 1, status: "DRAFT" as const, perspective: "TO_BE" as const,
      bpmn: makeBpmn("Process_Release", "Publicação em produção", "Preparar a mudança", "A janela está autorizada?", "Publicar e verificar a entrega", "Publicação reagendada"), sla: "P5D",
    },
  ];

  for (const item of processes) {
    await prisma.process.create({
      data: {
        id: item.id, slug: item.slug, title: item.title, description: item.description, category: item.category,
        audience: item.audience, visibility: item.id === ids.release ? "INTERNAL" : "PUBLIC", ownerUnitId: item.ownerUnitId, taxonomyId: ids.taxonomy,
        participantUnits: { create: [
          { unitId: item.ownerUnitId, role: "Dona do processo" },
          ...item.participantIds.filter((id) => id !== item.ownerUnitId).map((unitId) => ({ unitId, role: "Participante" })),
        ] },
        versions: { create: {
          id: item.versionId, revision: item.revision, status: item.status, perspective: item.perspective,
          bpmnXml: item.bpmn, processSla: item.sla, contentHash: hash(item.bpmn), createdBy: "seed",
          publishedAt: item.status === "PUBLISHED" ? new Date("2026-06-20T12:00:00Z") : undefined,
          submittedAt: item.status !== "DRAFT" ? new Date("2026-06-10T12:00:00Z") : undefined,
          unitApprovedAt: ["CURATOR_REVIEW", "PUBLISHED"].includes(item.status) ? new Date("2026-06-15T12:00:00Z") : undefined,
          curatorApprovedAt: item.status === "PUBLISHED" ? new Date("2026-06-20T12:00:00Z") : undefined,
        } },
      },
    });
  }

  await prisma.processRelation.createMany({ data: [
    { sourceProcessId: ids.intake, targetProcessId: ids.priority, type: "PRECEDES", label: "Demanda qualificada" },
    { sourceProcessId: ids.priority, targetProcessId: ids.delivery, type: "CALLS", label: "Demanda priorizada" },
    { sourceProcessId: ids.delivery, targetProcessId: ids.release, type: "PRECEDES", label: "Incremento homologado" },
    { sourceProcessId: ids.intake, targetProcessId: ids.delivery, type: "EXCHANGES_INFORMATION", label: "Requisitos e critérios" },
  ] });

  await prisma.softwareSystem.create({ data: {
    id: ids.system, name: "Sistemas FURG", slug: "sistemas-furg", description: "Ecossistema institucional de sistemas de gestão.", ownerUnitId: ids.cgti,
    modules: { create: { id: ids.module, name: "Demandas de software", slug: "demandas", functionalities: { create: {
      id: ids.functionality, name: "Registro de demandas", slug: "registro", operations: { create: {
        id: ids.operation, operationId: "registrarDemanda", method: "POST", path: "/demandas", version: "1.0.0",
      } },
    } } } },
  } });

  const jsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://processos.furg.br/schemas/demanda-software.v1.json",
    title: "Demanda de software",
    type: "object",
    required: ["titulo", "problema", "unidadeDemandante"],
    properties: {
      titulo: { type: "string", minLength: 5, description: "Nome curto e reconhecível da necessidade." },
      problema: { type: "string", minLength: 20, description: "Situação que precisa ser resolvida." },
      unidadeDemandante: { type: "string", description: "Identificador oficial da unidade." },
      publicoAfetado: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  };
  await prisma.informationAsset.create({ data: {
    id: ids.asset, name: "Demanda de software", slug: "demanda-software", description: "Informações mínimas para qualificar uma necessidade.", kind: "DATA_CONTRACT", ownerUnitId: ids.proiti,
    versions: { create: { id: ids.schema, version: 1, visibility: "PUBLIC", jsonSchema, contentHash: hash(JSON.stringify(jsonSchema)), createdBy: "seed" } },
  } });

  await prisma.elementBinding.createMany({ data: [
    { processVersionId: ids.intakeVersion, bpmnElementId: "Activity_Receive", organizationUnitId: ids.cgti, role: "Analista de negócio", workDuration: "PT4H", waitDuration: "P2D" },
    { processVersionId: ids.intakeVersion, bpmnElementId: "Activity_Approve", organizationUnitId: ids.cgti, role: "Gestor de demandas", workDuration: "PT2H", waitDuration: "P1D", operationId: ids.operation, kind: "SUPPORTS" },
  ] });
  await prisma.dataBinding.create({ data: { processVersionId: ids.intakeVersion, bpmnElementId: "Activity_Approve", informationSchemaId: ids.schema, direction: "OUTPUT" } });

  console.log("Dados piloto criados: 4 processos, 4 unidades, 1 operação e 1 contrato de dados.");
}

main().finally(() => prisma.$disconnect());
