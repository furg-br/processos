import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller.js";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "./prisma.service.js";
import { ProcessController } from "./process.controller.js";
import { ProcessService } from "./process.service.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  controllers: [HealthController, ProcessController, CatalogController],
  providers: [PrismaService, ProcessService, WorkflowService],
})
export class AppModule {}
