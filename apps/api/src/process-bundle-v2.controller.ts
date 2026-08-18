import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProcessBundleV2Service } from "./process-bundle-v2.service.js";

@ApiTags("process-bundle-v2")
@Controller()
export class ProcessBundleV2Controller {
  constructor(private readonly bundles: ProcessBundleV2Service) {}

  @Post("process-bundles/imports/dry-run")
  @ApiOperation({ summary: "Valida um ProcessBundle v2 em quarentena sem alterar o catálogo" })
  dryRun(@Body() body: { fileName: string; contentBase64: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.dryRun(body, headers);
  }

  @Post("process-bundles/imports/:importId/apply")
  @ApiOperation({ summary: "Aplica transacionalmente uma importação v2 validada" })
  apply(@Param("importId") importId: string, @Body() body: { unitMappings?: Array<{ reference: string; unitId: string; role: "OWNER" | "PARTICIPANT" }>; ownerUnitId?: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.apply(importId, body, headers);
  }

  @Post("processes/:processId/versions/:versionId/technical-bindings/review")
  @ApiOperation({ summary: "Aprova ou rejeita vínculos técnicos como administrador CGTI" })
  reviewBindings(@Param("versionId") versionId: string, @Body() body: { bindingSetVersionId?: string; semanticKeys: string[]; decision: "APPROVED" | "REJECTED"; note?: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.reviewBindings(versionId, body, headers);
  }

  @Post("processes/:processId/versions/:versionId/fork-v2")
  @ApiOperation({ summary: "Cria nova versão editável a partir de uma versão v2 imutável" })
  forkVersion(@Param("processId") processId: string, @Param("versionId") versionId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.forkVersion(processId, versionId, headers);
  }

  @Get("processes/:processId/versions/:versionId/authoring")
  @ApiOperation({ summary: "Obtém todos os recursos canônicos para autoria governada" })
  authoringState(@Param("processId") processId: string, @Param("versionId") versionId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.authoringState(processId, versionId, headers);
  }

  @Patch("processes/:processId/versions/:versionId/contract-resources/:resourceKey")
  @ApiOperation({ summary: "Atualiza um recurso v2 e regenera o pacote canônico" })
  updateResource(@Param("processId") processId: string, @Param("versionId") versionId: string, @Param("resourceKey") resourceKey: string, @Body() body: { content: unknown; reason: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.updateContractResource(processId, versionId, resourceKey, body, headers);
  }

  @Patch("processes/:processId/versions/:versionId/responsibilities")
  @ApiOperation({ summary: "Atualiza responsável e participantes preservando referências canônicas" })
  updateResponsibilities(@Param("processId") processId: string, @Param("versionId") versionId: string, @Body() body: { ownerUnitId: string; participantUnitIds: string[]; reason: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.updateResponsibilities(processId, versionId, body, headers);
  }

  @Post("processes/:processId/versions/:versionId/git-evidence/check")
  @ApiOperation({ summary: "Registra a verificação de evidência Git e informa drift" })
  checkGitDrift(@Param("versionId") versionId: string, @Body() body: { sourceArtifactKey: string; observedHash: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.checkGitDrift(versionId, body, headers);
  }

  @Get("processes/:locator/projection")
  projection(@Param("locator") locator: string, @Query("audience") audience: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED" = "PUBLIC", @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.projection(locator, audience, headers);
  }

  @Get("processes/:locator/activities/:semanticId")
  activity(@Param("locator") locator: string, @Param("semanticId") semanticId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.activity(locator, semanticId, headers);
  }

  @Get("processes/:locator/access-matrix")
  accessMatrix(@Param("locator") locator: string, @Headers() headers: Record<string, string | undefined>) {
    return this.bundles.accessMatrix(locator, headers);
  }
}
