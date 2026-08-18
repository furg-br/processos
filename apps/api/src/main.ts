import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser("json", { limit: "25mb" });
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle("Catálogo Institucional de Processos da FURG")
    .setDescription("API aberta para processos, governança, catálogos e contratos de informação.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.openapi = "3.1.0";
  document.info.version = "2.0";
  SwaggerModule.setup("api/v1/docs", app, document);

  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}

void bootstrap();
