import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import * as Ajv2020Module from "ajv/dist/2020.js";
import YAML from "yaml";
import { PrismaService } from "./prisma.service.js";

const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head"];

@ApiTags("catálogos")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("organizations")
  organizations() {
    return this.prisma.organizationUnit.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }

  @Get("taxonomies")
  taxonomies() {
    return this.prisma.taxonomy.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }

  @Get("software/operations")
  operations() {
    return this.prisma.softwareOperation.findMany({
      include: { functionality: { include: { module: { include: { system: true } } } } },
      orderBy: { operationId: "asc" },
    });
  }

  @Get("software/functionalities")
  functionalities() {
    return this.prisma.functionality.findMany({ include: { module: { include: { system: true } } }, orderBy: [{ module: { system: { name: "asc" } } }, { module: { name: "asc" } }, { name: "asc" }] });
  }

  @Post("software/operations")
  async createOperation(@Body() body: { functionalityId: string; operationId: string; method?: string; path?: string; version: string; deprecated?: boolean }, @Headers() headers: Record<string, string | undefined>) {
    this.assertCatalogAdministration(headers);
    await this.assertFunctionality(body.functionalityId);
    if (!body.operationId?.trim() || !body.version?.trim()) throw new BadRequestException("Informe o identificador e a versão da operação.");
    return this.prisma.softwareOperation.create({ data: { functionalityId: body.functionalityId, operationId: body.operationId.trim(), method: body.method?.trim().toUpperCase() || null, path: body.path?.trim() || null, version: body.version.trim(), deprecated: Boolean(body.deprecated) }, include: { functionality: { include: { module: { include: { system: true } } } } } });
  }

  @Patch("software/operations/:operationId")
  async updateOperation(@Param("operationId") id: string, @Body() body: { functionalityId: string; operationId: string; method?: string; path?: string; version: string; deprecated?: boolean }, @Headers() headers: Record<string, string | undefined>) {
    this.assertCatalogAdministration(headers);
    await this.assertFunctionality(body.functionalityId);
    if (!body.operationId?.trim() || !body.version?.trim()) throw new BadRequestException("Informe o identificador e a versão da operação.");
    return this.prisma.softwareOperation.update({ where: { id }, data: { functionalityId: body.functionalityId, operationId: body.operationId.trim(), method: body.method?.trim().toUpperCase() || null, path: body.path?.trim() || null, version: body.version.trim(), deprecated: Boolean(body.deprecated) }, include: { functionality: { include: { module: { include: { system: true } } } } } });
  }

  @Delete("software/operations/:operationId")
  async deleteOperation(@Param("operationId") id: string, @Headers() headers: Record<string, string | undefined>) {
    this.assertCatalogAdministration(headers);
    const bindings = await this.prisma.elementBinding.count({ where: { operationId: id } });
    if (bindings) throw new ConflictException("A operação está vinculada a elementos BPMN e não pode ser removida. Marque-a como descontinuada.");
    await this.prisma.softwareOperation.delete({ where: { id } });
    return { deleted: true };
  }

  @Post("software/openapi/import")
  async importOpenApi(@Body() body: { functionalityId: string; document: string }, @Headers() headers: Record<string, string | undefined>) {
    this.assertCatalogAdministration(headers);
    await this.assertFunctionality(body.functionalityId);
    const parsed = YAML.parse(body.document) as Record<string, any>;
    if (!parsed?.openapi || !parsed.paths) throw new BadRequestException("Informe um documento OpenAPI 3.x válido.");
    const sourceHash = createHash("sha256").update(body.document).digest("hex");
    const version = String(parsed.info?.version ?? "1.0.0");
    const imported = [];
    for (const [path, pathItem] of Object.entries(parsed.paths as Record<string, Record<string, any>>)) {
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) continue;
        const operationId = String(operation.operationId ?? `${method}-${path}`);
        imported.push(await this.prisma.softwareOperation.upsert({
          where: { functionalityId_operationId_version: { functionalityId: body.functionalityId, operationId, version } },
          update: { method: method.toUpperCase(), path, sourceHash, deprecated: Boolean(operation.deprecated) },
          create: { functionalityId: body.functionalityId, operationId, version, method: method.toUpperCase(), path, sourceHash, deprecated: Boolean(operation.deprecated) },
        }));
      }
    }
    return { openapi: parsed.openapi, title: parsed.info?.title, version, imported: imported.length, operations: imported };
  }

  @Get("information-schemas")
  informationSchemas() {
    return this.prisma.informationSchemaVersion.findMany({ include: { asset: true }, orderBy: [{ asset: { name: "asc" } }, { version: "desc" }] });
  }

  @Post("information-schemas")
  async createInformationSchema(@Body() body: {
    assetId?: string; name: string; slug: string; description: string; kind: string;
    visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED"; jsonSchema: Record<string, unknown>;
  }, @Headers() headers: Record<string, string | undefined>) {
    this.assertCatalogAdministration(headers);
    const Ajv2020 = (Ajv2020Module as unknown as { default: new (options: object) => { compile: (schema: object) => unknown } }).default;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    try { ajv.compile(body.jsonSchema); } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "JSON Schema inválido.");
    }
    const asset = body.assetId
      ? await this.prisma.informationAsset.findUniqueOrThrow({ where: { id: body.assetId } })
      : await this.prisma.informationAsset.create({ data: { name: body.name, slug: body.slug, description: body.description, kind: body.kind } });
    const last = await this.prisma.informationSchemaVersion.findFirst({ where: { assetId: asset.id }, orderBy: { version: "desc" } });
    return this.prisma.informationSchemaVersion.create({
      data: {
        assetId: asset.id,
        version: (last?.version ?? 0) + 1,
        visibility: body.visibility,
        jsonSchema: body.jsonSchema as object,
        contentHash: createHash("sha256").update(JSON.stringify(body.jsonSchema)).digest("hex"),
        createdBy: "00000000-0000-4000-8000-000000000001",
      },
      include: { asset: true },
    });
  }

  private assertCatalogAdministration(headers?: Record<string, string | undefined>) {
    if ((process.env.AUTH_MODE ?? "development") === "development") return;
    const roles = (headers?.["x-platform-roles"] ?? headers?.["x-platform-role"] ?? "").split(",").map((role) => role.trim());
    if (!roles.some((role) => ["CGTI_ADMIN", "PLATFORM_ADMIN"].includes(role))) throw new ForbiddenException("Somente administradores do CGTI podem alterar catálogos técnicos.");
  }

  private async assertFunctionality(functionalityId: string) {
    if (!await this.prisma.functionality.findUnique({ where: { id: functionalityId }, select: { id: true } })) throw new BadRequestException("Selecione uma funcionalidade existente.");
  }
}
