import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { AppModule } from "./app.module.js";
import { PrismaService } from "./prisma.service.js";

describe("AppModule", () => {
  it("resolve o grafo de dependências da aplicação", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: vi.fn(), $disconnect: vi.fn() })
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
