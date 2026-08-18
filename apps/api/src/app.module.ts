import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { CatalogController } from "./catalog.controller.js";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "./prisma.service.js";
import { ProcessController } from "./process.controller.js";
import { ProcessService } from "./process.service.js";
import { ProcessBundleV2Controller } from "./process-bundle-v2.controller.js";
import { ProcessBundleV2Service } from "./process-bundle-v2.service.js";
import { WorkflowService } from "./workflow.service.js";
import { GovernanceController } from "./governance.controller.js";
import { GovernanceService } from "./governance.service.js";
import { IdentityMiddleware } from "./identity.middleware.js";
import { MetricsController, MetricsInterceptor, MetricsService } from "./metrics.service.js";
import { WebhookController, WebhookService } from "./webhook.service.js";
import { AuthorizationService } from "./authorization.service.js";

@Module({
  controllers: [HealthController, MetricsController, ProcessBundleV2Controller, GovernanceController, WebhookController, ProcessController, CatalogController],
  providers: [PrismaService, AuthorizationService, ProcessService, ProcessBundleV2Service, GovernanceService, WebhookService, WorkflowService, MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(IdentityMiddleware).forRoutes("{*path}"); }
}
