import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BPMN_XML } from "@furg/processos-bpmn";
import { ProcessService } from "./process.service.js";
import { WorkflowService } from "./workflow.service.js";
import { AuthorizationService } from "./authorization.service.js";

afterEach(() => vi.unstubAllEnvs());

describe("consulta de processo por endereço legível", () => {
  it("procura pelo UUID ou slug e ignora processos arquivados", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new ProcessService({ process: { findFirst } } as never, new WorkflowService());

    await expect(service.detail("solicitacao-desenvolvimento")).rejects.toThrow("Processo não encontrado.");

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ id: "solicitacao-desenvolvimento" }, { slug: "solicitacao-desenvolvimento" }],
        archivedAt: null,
      },
    }));
  });
});

describe("visibilidade das revisões internas", () => {
  it("mostra o rascunho à unidade autorizada e mantém a publicação como fallback para os demais", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const prisma = { delegatedAdministration: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ProcessService(prisma as never, new WorkflowService(), new AuthorizationService(prisma as never));
    const draft = { id: "draft", status: "DRAFT", perspective: "AS_IS" };
    const published = { id: "published", status: "PUBLISHED", perspective: "AS_IS" };
    const row = { ownerUnitId: "unit-1", versions: [draft, published] };

    await expect((service as any).selectVersionForViewer(row, { "x-unit-ids": "unit-1", "x-platform-roles": "UNIT_EDITOR" })).resolves.toBe(draft);
    await expect((service as any).selectVersionForViewer(row, { "x-unit-ids": "unit-2", "x-platform-roles": "UNIT_EDITOR" })).resolves.toBe(published);
  });

  it("protege processos restritos com papel e escopo de unidade", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const prisma = { delegatedAdministration: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ProcessService(prisma as never, new WorkflowService(), new AuthorizationService(prisma as never));
    const row = { visibility: "RESTRICTED", ownerUnitId: "unit-1" };

    await expect((service as any).assertProcessVisibility(row, { "x-unit-ids": "unit-1", "x-platform-roles": "UNIT_EDITOR" })).rejects.toThrow("UNIT_ADMIN");
    await expect((service as any).assertProcessVisibility(row, { "x-unit-ids": "unit-1", "x-platform-roles": "UNIT_ADMIN" })).resolves.toBeUndefined();
  });
});

describe("edição dos dados cadastrais", () => {
  it("atualiza processo, unidade proprietária, cenário e auditoria na mesma transação", async () => {
    const tx = {
      process: { update: vi.fn().mockResolvedValue({}) },
      processUnit: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
      processVersion: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({
        id: "version-id",
        status: "DRAFT",
        perspective: "AS_IS",
        process: {
          id: "process-id",
          title: "Processo anterior",
          description: "Descrição anterior do processo.",
          category: "Categoria anterior",
          audience: "Público anterior",
          visibility: "INTERNAL",
          ownerUnitId: "00000000-0000-4000-8000-000000000001",
        },
      }) },
      organizationUnit: { findFirst: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" }) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
    };
    const service = new ProcessService(prisma as never, new WorkflowService());
    vi.spyOn(service, "detail").mockResolvedValue({ id: "process-id", title: "Processo revisado" } as never);

    await service.updateMetadata("process-id", "version-id", {
      title: "Processo revisado",
      description: "Descrição revisada do processo institucional.",
      category: "Categoria revisada",
      audience: "Comunidade universitária",
      visibility: "PUBLIC",
      ownerUnitId: "00000000-0000-4000-8000-000000000002",
      perspective: "TO_BE",
    });

    expect(tx.process.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "process-id" },
      data: expect.objectContaining({ title: "Processo revisado", ownerUnitId: "00000000-0000-4000-8000-000000000002" }),
    }));
    expect(tx.processUnit.deleteMany).toHaveBeenCalledWith({ where: { processId: "process-id", role: "Dona do processo" } });
    expect(tx.processUnit.create).toHaveBeenCalledWith({ data: { processId: "process-id", unitId: "00000000-0000-4000-8000-000000000002", role: "Dona do processo" } });
    expect(tx.processVersion.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-id" },
      data: expect.objectContaining({ perspective: "TO_BE", audits: { create: expect.objectContaining({ action: "PROCESS_METADATA_UPDATED" }) } }),
    }));
  });
});

describe("persistência do BPMN", () => {
  it("grava XML, hash e evidências de auditoria no mesmo salvamento", async () => {
    const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ contentHash: data.contentHash }));
    const prisma = {
      processVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "version-id", status: "DRAFT", process: { continuous: false } }),
        update,
      },
      editLease: { findFirst: vi.fn().mockResolvedValue({ id: "lease-id" }) },
    };
    const service = new ProcessService(prisma as never, new WorkflowService());

    const result = await service.updateBpmn("process-id", "version-id", EMPTY_BPMN_XML, "lease-token");

    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-id" },
      data: expect.objectContaining({
        bpmnXml: EMPTY_BPMN_XML,
        contentHash: result.contentHash,
        audits: { create: expect.objectContaining({
          action: "BPMN_SAVED",
          details: { issueCount: 0, contentHash: result.contentHash, xmlChars: EMPTY_BPMN_XML.length },
        }) },
      }),
    }));
  });
});

describe("integridade das relações entre processos", () => {
  it("rejeita elemento BPMN de origem que não existe na versão atual", async () => {
    const transaction = vi.fn();
    const prisma = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({ id: "version-id", status: "DRAFT", immutableAt: null, bpmnXml: EMPTY_BPMN_XML, process: { ownerUnitId: "unit-id" } }) },
      process: { findFirst: vi.fn().mockResolvedValue({ id: "target-id", title: "Processo de destino" }) },
      processRelation: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: transaction,
    };
    const service = new ProcessService(prisma as never, new WorkflowService());

    await expect(service.createRelation("source-id", "version-id", {
      targetProcessId: "target-id", type: "RELATED_TO", sourceElementId: "Activity_Inexistente",
    })).rejects.toThrow("não existe na versão atual");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejeita ciclo em relações de decomposição antes de alterar o banco", async () => {
    const transaction = vi.fn();
    const prisma = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({ id: "version-id", status: "DRAFT", immutableAt: null, bpmnXml: EMPTY_BPMN_XML, process: { ownerUnitId: "unit-id" } }) },
      process: { findFirst: vi.fn().mockResolvedValue({ id: "target-id", title: "Processo de destino" }) },
      processRelation: { findMany: vi.fn().mockResolvedValue([{ sourceProcessId: "target-id", targetProcessId: "source-id" }]) },
      $transaction: transaction,
    };
    const service = new ProcessService(prisma as never, new WorkflowService());

    await expect(service.createRelation("source-id", "version-id", {
      targetProcessId: "target-id", type: "DECOMPOSES",
    })).rejects.toThrow("criaria um ciclo");
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("governança de revisão", () => {
  it("exige uma justificativa limitada para devolução e arquivamento", async () => {
    const processVersion = { findFirst: vi.fn().mockResolvedValue({
      id: "version-id", status: "UNIT_REVIEW", process: { ownerUnitId: "unit-id" }, activeBindingSet: null,
    }) };
    const service = new ProcessService({ processVersion } as never, new WorkflowService());

    await expect(service.transition("process-id", "version-id", "REQUEST_CHANGES", "   ")).rejects.toThrow("Informe uma justificativa");
    await expect(service.transition("process-id", "version-id", "REQUEST_CHANGES", "x".repeat(1001))).rejects.toThrow("no máximo 1.000 caracteres");
  });
});

describe("remoção de versão em rascunho", () => {
  it("remove somente a versão e preserva a exclusão na auditoria de outra revisão", async () => {
    const tx = {
      processVersion: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: "draft-version-id", revision: 2, status: "DRAFT" })
          .mockResolvedValueOnce({ id: "published-version-id" }),
        count: vi.fn().mockResolvedValue(2),
        delete: vi.fn().mockResolvedValue({}),
      },
      editLease: { findFirst: vi.fn().mockResolvedValue(null) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
    };
    const service = new ProcessService(prisma as never, new WorkflowService());
    vi.spyOn(service, "detail").mockResolvedValue({ id: "process-id", title: "Processo preservado" } as never);

    const result = await service.deleteDraftVersion("process-id", "draft-version-id", {
      "x-user-id": "actor-id",
      "x-user-name": "Pessoa curadora",
    });

    expect(result).toEqual(expect.objectContaining({ deletedVersionId: "draft-version-id", deletedProcess: false }));
    expect(tx.processVersion.delete).toHaveBeenCalledWith({ where: { id: "draft-version-id" } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      processVersionId: "published-version-id",
      actorId: "actor-id",
      action: "DRAFT_VERSION_DELETED",
      details: { deletedVersionId: "draft-version-id", revision: 2 },
    }) });
  });

  it("remove também o processo quando o rascunho é sua única versão", async () => {
    const deleteProcess = vi.fn().mockResolvedValue({});
    const tx = {
      processVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "draft-version-id", revision: 1, status: "DRAFT" }),
        count: vi.fn().mockResolvedValue(1),
      },
      editLease: { findFirst: vi.fn().mockResolvedValue(null) },
      process: { delete: deleteProcess },
    };
    const prisma = { $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)) };
    const service = new ProcessService(prisma as never, new WorkflowService());

    await expect(service.deleteDraftVersion("process-id", "draft-version-id")).resolves.toEqual({
      deletedVersionId: "draft-version-id",
      deletedProcess: true,
    });
    expect(deleteProcess).toHaveBeenCalledWith({ where: { id: "process-id" } });
  });

  it("recusa versões publicadas e rascunhos com edição ativa", async () => {
    const publishedTx = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({ id: "version-id", revision: 1, status: "PUBLISHED" }) },
    };
    const publishedService = new ProcessService({
      $transaction: vi.fn(async (operation: (client: typeof publishedTx) => Promise<void>) => operation(publishedTx)),
    } as never, new WorkflowService());
    await expect(publishedService.deleteDraftVersion("process-id", "version-id")).rejects.toThrow("Somente versões em rascunho");

    const leasedTx = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({ id: "version-id", revision: 1, status: "DRAFT" }) },
      editLease: { findFirst: vi.fn().mockResolvedValue({ holderName: "Diogo" }) },
    };
    const leasedService = new ProcessService({
      $transaction: vi.fn(async (operation: (client: typeof leasedTx) => Promise<void>) => operation(leasedTx)),
    } as never, new WorkflowService());
    await expect(leasedService.deleteDraftVersion("process-id", "version-id")).rejects.toThrow("Encerre a edição de Diogo");
  });
});

describe("exportação de release v2", () => {
  it("devolve o ZIP canônico preservado byte a byte", async () => {
    const canonicalBundle = Buffer.from("zip-canônico-de-teste", "utf8");
    const prisma = {
      processVersion: { findFirst: vi.fn().mockResolvedValue({
        id: "version-id",
        processId: "process-id",
        contractVersion: "v2",
        conformanceProfile: "IMPLEMENTABLE",
        process: { ownerUnitId: "unit-id" },
        activeBindingSet: {
          id: "binding-id",
          bundleContent: canonicalBundle,
          resources: [{ kind: "ProcessDefinition", content: { metadata: { key: "processo.teste" }, spec: { releaseId: "release-id" } } }],
          files: [],
        },
      }) },
    };
    const service = new ProcessService(prisma as never, new WorkflowService());
    vi.spyOn(service, "detail").mockResolvedValue({ id: "process-id" } as never);

    const exported = await service.exportBundle("process-id", "version-id");

    expect(exported.equals(canonicalBundle)).toBe(true);
  });
});
