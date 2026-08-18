import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { RelationType, VersionStatus, Visibility } from "@prisma/client";
import type { CreateProcessInput, UpdateProcessInput } from "@furg/processos-contracts";
import type { Response } from "express";
import { ProcessService } from "./process.service.js";
import type { WorkflowAction } from "./workflow.service.js";

@ApiTags("processos")
@Controller("processes")
export class ProcessController {
  constructor(private readonly processes: ProcessService) {}

  @Get()
  @ApiOperation({ summary: "Pesquisa o catálogo de processos" })
  list(@Headers() headers: Record<string, string | undefined>, @Query("q") q?: string, @Query("visibility") visibility?: Visibility, @Query("status") status?: VersionStatus) {
    return this.processes.list({ q, visibility, status }, headers);
  }

  @Get("relations/catalog")
  @ApiOperation({ summary: "Lista as relações visíveis do mapa institucional" })
  relations(@Headers() headers: Record<string, string | undefined>) {
    return this.processes.listRelations(headers);
  }

  @Get(":locator")
  @ApiOperation({ summary: "Obtém processo, revisão governada mais recente e visão textual" })
  detail(@Param("locator") locator: string, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.detail(locator, headers);
  }

  @Post()
  @ApiOperation({ summary: "Cria um processo com a primeira versão em rascunho" })
  create(@Body() body: CreateProcessInput, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.create(body, headers);
  }

  @Patch(":processId/versions/:versionId/metadata")
  @ApiOperation({ summary: "Atualiza os dados cadastrais de um processo editável" })
  updateMetadata(
    @Param("processId") processId: string,
    @Param("versionId") versionId: string,
    @Body() body: UpdateProcessInput,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.processes.updateMetadata(processId, versionId, body, headers);
  }

  @Post(":processId/versions/:versionId/relations")
  @ApiOperation({ summary: "Registra uma relação de saída entre processos" })
  createRelation(@Param("processId") processId: string, @Param("versionId") versionId: string, @Body() body: { targetProcessId: string; type: RelationType; label?: string; sourceElementId?: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.createRelation(processId, versionId, body, headers);
  }

  @Patch(":processId/versions/:versionId/relations/:relationId")
  @ApiOperation({ summary: "Altera uma relação de saída entre processos" })
  updateRelation(@Param("processId") processId: string, @Param("versionId") versionId: string, @Param("relationId") relationId: string, @Body() body: { type: RelationType; label?: string; sourceElementId?: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.updateRelation(processId, versionId, relationId, body, headers);
  }

  @Delete(":processId/versions/:versionId/relations/:relationId")
  @ApiOperation({ summary: "Remove uma relação de saída entre processos" })
  deleteRelation(@Param("processId") processId: string, @Param("versionId") versionId: string, @Param("relationId") relationId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.deleteRelation(processId, versionId, relationId, headers);
  }

  @Post("import")
  @ApiOperation({ summary: "Importa BPMN XML ou ProcessBundle v1 em Base64" })
  importFile(@Body() body: { fileName: string; contentBase64: string; title?: string; slug?: string; ownerUnitId?: string }, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.importFile(body, headers);
  }

  @Patch(":processId/versions/:versionId/bpmn")
  saveBpmn(
    @Param("processId") processId: string,
    @Param("versionId") versionId: string,
    @Body() body: { bpmnXml: string; leaseToken: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.processes.updateBpmn(processId, versionId, body.bpmnXml, body.leaseToken, headers);
  }

  @Get(":processId/versions/:versionId/validate")
  validate(@Param("processId") processId: string, @Param("versionId") versionId: string) {
    return this.processes.validate(processId, versionId);
  }

  @Post(":processId/versions/:versionId/transitions")
  transition(
    @Param("processId") processId: string,
    @Param("versionId") versionId: string,
    @Body() body: { action: WorkflowAction; note?: string },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.processes.transition(processId, versionId, body.action, body.note, headers);
  }

  @Delete(":processId/versions/:versionId")
  @ApiOperation({ summary: "Remove uma versão em rascunho" })
  deleteDraftVersion(
    @Param("processId") processId: string,
    @Param("versionId") versionId: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.processes.deleteDraftVersion(processId, versionId, headers);
  }

  @Post(":processId/versions/:versionId/lease")
  acquireLease(@Param("processId") processId: string, @Param("versionId") versionId: string, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.acquireLease(processId, versionId, headers);
  }

  @Patch("leases/:token")
  renewLease(@Param("token") token: string, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.renewLease(token, headers);
  }

  @Delete("leases/:token")
  releaseLease(@Param("token") token: string, @Headers() headers: Record<string, string | undefined>) {
    return this.processes.releaseLease(token, headers);
  }

  @Get(":processId/diff")
  diff(@Param("processId") processId: string, @Query("from") from: string, @Query("to") to: string) {
    return this.processes.diff(processId, from, to);
  }

  @Get(":processId/versions/:versionId/export")
  async exportBundle(
    @Param("processId") processId: string,
    @Param("versionId") versionId: string,
    @Headers() headers: Record<string, string | undefined>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const buffer = await this.processes.exportBundle(processId, versionId, headers);
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="processo-${processId}.zip"`);
    return new StreamableFile(buffer);
  }
}
