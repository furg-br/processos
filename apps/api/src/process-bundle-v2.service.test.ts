import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { filterResourcesForAudience, ProcessBundleV2Service, processMeaningHash } from "./process-bundle-v2.service.js";
import { validateProcessBundleV2 } from "@furg/processos-bundle";

describe("quarentena de ProcessBundle v2", () => {
  it("bloqueia a persistência quando a alteração torna o pacote inconsistente", () => {
    const service = new ProcessBundleV2Service({} as never);

    expect(() => (service as any).assertValidAuthoredBundle({
      valid: false,
      resources: [],
      coverage: {},
      issues: [{ severity: "error", code: "BROKEN_REF", path: "operacao.inexistente", message: "Operação não encontrada." }],
    })).toThrow("não foi salva porque deixaria o contrato inconsistente");
  });

  it("valida hashes e referências sem aplicar mutações no catálogo", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "import-id", ...data }));
    const prisma = {
      bundleResource: { findFirst: vi.fn().mockResolvedValue(null) },
      bundleImportJob: { create },
      organizationUnitReference: { findMany: vi.fn().mockResolvedValue([
        { reference: "unidade.progep", unit: { id: "progep", externalId: "FURG-PROGEP", acronym: "PROGEP", name: "Pró-Reitoria de Gestão e Desenvolvimento de Pessoas" } },
        { reference: "unidade.comissao.rsc", unit: { id: "crsc", externalId: "FURG-CRSC", acronym: "CRSC", name: "Comissão RSC-PCCTAE" } },
      ]) },
    };
    const service = new ProcessBundleV2Service(prisma as never);
    const bundle = await readFile(resolve(import.meta.dirname, "../../../artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip"));

    const result = await service.dryRun({ fileName: "rsc.zip", contentBase64: bundle.toString("base64") });

    expect(result).toMatchObject({ importId: "import-id", valid: true, readyToApply: true, requiresCgtiApproval: true, technicalBindingsWillBe: "PENDING_CGTI_APPROVAL" });
    expect(result.institutionalUnitMappings).toMatchObject([
      { reference: "unidade.progep", role: "OWNER", status: "RESOLVED", resolvedUnit: { externalId: "FURG-PROGEP" } },
      { reference: "unidade.comissao.rsc", role: "PARTICIPANT", status: "RESOLVED", resolvedUnit: { externalId: "FURG-CRSC" } },
    ]);
    expect(result.coverage).toMatchObject({ bpmnActivities: 18, completeMappings: 18, operations: 17, forms: 11, decisions: 3 });
    expect(create).toHaveBeenCalledOnce();
    expect((create.mock.calls[0]?.[0] as any).data.status).toBe("VALIDATED");
  });

  it("bloqueia referência institucional ausente em vez de escolher a primeira unidade", async () => {
    const prisma = {
      organizationUnitReference: { findMany: vi.fn().mockResolvedValue([]) },
      organizationUnit: { findMany: vi.fn() },
    };
    const service = new ProcessBundleV2Service(prisma as never);
    const resources = [{
      kind: "ProcessDefinition", spec: { ownerUnitRef: "unidade.inexistente", participantUnitRefs: [] },
    }, {
      kind: "InstitutionalContextCatalog", spec: { organizationUnits: [{ key: "unidade.inexistente", acronym: "NOVA", label: "Unidade nova" }] },
    }];

    await expect((service as any).validateInstitutionalUnitMappings(resources, [], {})).rejects.toThrow("ainda não possui correspondência");
    expect(prisma.organizationUnit.findMany).not.toHaveBeenCalled();
  });

  it("reserva a aprovação de vínculos técnicos ao CGTI", async () => {
    const service = new ProcessBundleV2Service({ technicalBindingApproval: { updateMany: vi.fn() } } as never);
    await expect(service.reviewBindings("version-id", { semanticKeys: ["operacao.teste"], decision: "APPROVED" })).rejects.toThrow("Somente administradores do CGTI");
  });

  it("aceita administração da unidade informada pelo provedor institucional", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const findFirst = vi.fn();
    const service = new ProcessBundleV2Service({ delegatedAdministration: { findFirst } } as never);

    await expect((service as any).assertUnitCapability("unidade-progep", "BUNDLE_IMPORT", {
      "x-user-id": "usuario-1",
      "x-unit-ids": "unidade-progep,unidade-cgti",
      "x-platform-role": "UNIT_EDITOR",
    })).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("rejeita importação em unidade sem vínculo nem delegação explícita", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const service = new ProcessBundleV2Service({ delegatedAdministration: { findFirst: vi.fn().mockResolvedValue(null) } } as never);

    await expect((service as any).assertUnitCapability("unidade-progep", "BUNDLE_IMPORT", {
      "x-user-id": "usuario-externo",
      "x-unit-ids": "unidade-outra",
      "x-platform-role": "UNIT_EDITOR",
    })).rejects.toThrow("não possui a capacidade BUNDLE_IMPORT");
    vi.unstubAllEnvs();
  });

  it("separa alteração técnica de mudança no significado do processo", async () => {
    const bundle = await readFile(resolve(import.meta.dirname, "../../../artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip"));
    const report = await validateProcessBundleV2(bundle);
    const technicalChange = structuredClone(report.resources) as any[];
    technicalChange.find((item) => item.kind === "SoftwareCatalog").spec.operations[0].path = "/rota-refatorada";
    const businessChange = structuredClone(report.resources) as any[];
    businessChange.find((item) => item.kind === "PhaseCatalog").spec.phases[0].label = "Outra fase";
    const deadlineChange = structuredClone(report.resources) as any[];
    deadlineChange.find((item) => item.kind === "AutomationCatalog").spec.timingPolicies[0].duration = "P30D";
    const cronInfrastructureChange = structuredClone(report.resources) as any[];
    cronInfrastructureChange.find((item) => item.kind === "AutomationCatalog").spec.jobs[0].executor = "outro-runtime";
    const actionMeaningChange = structuredClone(report.resources) as any[];
    actionMeaningChange.find((item) => item.kind === "OperationalTraceabilityCatalog").spec.activities[0].completionActions[0].label = "Outra ação institucional";
    const operationBindingChange = structuredClone(report.resources) as any[];
    operationBindingChange.find((item) => item.kind === "OperationalTraceabilityCatalog").spec.activities[1].completionActions[0].operationRefs = ["operacao.nova"];
    const accessRuleChange = structuredClone(report.resources) as any[];
    accessRuleChange.find((item) => item.kind === "AccessCatalog").spec.policies[0].expression = "false";
    const provenanceChange = structuredClone(report.resources) as any[];
    provenanceChange.find((item) => item.kind === "ProvenanceCatalog").spec.evidence[0].confidence = 0.5;

    expect(processMeaningHash(technicalChange as any)).toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(cronInfrastructureChange as any)).toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(operationBindingChange as any)).toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(provenanceChange as any)).toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(businessChange as any)).not.toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(deadlineChange as any)).not.toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(actionMeaningChange as any)).not.toBe(processMeaningHash(report.resources));
    expect(processMeaningHash(accessRuleChange as any)).not.toBe(processMeaningHash(report.resources));
  });

  it("não entrega recursos técnicos ou restritos na projeção institucional", async () => {
    const bundle = await readFile(resolve(import.meta.dirname, "../../../artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip"));
    const report = await validateProcessBundleV2(bundle);

    const institutional = filterResourcesForAudience(report.resources, "INSTITUTIONAL");
    const technical = filterResourcesForAudience(report.resources, "TECHNICAL");

    expect(institutional.every((resource) => ["PUBLIC", "INSTITUTIONAL"].includes(resource.metadata.visibility))).toBe(true);
    expect(technical.some((resource) => resource.metadata.visibility === "TECHNICAL")).toBe(true);
    expect(technical.some((resource) => resource.metadata.visibility === "RESTRICTED")).toBe(false);
  });
});
