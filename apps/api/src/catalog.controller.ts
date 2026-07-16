import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
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

  @Post("software/openapi/import")
  async importOpenApi(@Body() body: { functionalityId: string; document: string }) {
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
  }) {
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
}
