import { BadRequestException, Controller, ForbiddenException, Injectable, Post, Headers } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "./prisma.service.js";

const isCgti = (headers?: Record<string, string | undefined>) => (headers?.["x-platform-roles"] ?? headers?.["x-platform-role"] ?? "").split(",").some((role) => ["CGTI_ADMIN", "PLATFORM_ADMIN"].includes(role.trim()));

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async dispatch(headers?: Record<string, string | undefined>) {
    if (!isCgti(headers)) throw new ForbiddenException("Somente administradores do CGTI podem despachar webhooks de revisão.");
    const url = process.env.PROCESS_REVIEW_WEBHOOK_URL;
    const secret = process.env.PROCESS_REVIEW_WEBHOOK_SECRET;
    if (!url || !secret) throw new BadRequestException("PROCESS_REVIEW_WEBHOOK_URL e PROCESS_REVIEW_WEBHOOK_SECRET não estão configurados.");
    const events = await this.prisma.webhookOutboxEvent.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, nextAttempt: { lte: new Date() }, attempts: { lt: 10 } }, orderBy: { createdAt: "asc" }, take: 20 });
    const results: Array<{ id: string; delivered: boolean; status?: number }> = [];
    for (const event of events) {
      const body = JSON.stringify({ id: event.id, type: event.type, createdAt: event.createdAt.toISOString(), data: event.payload });
      const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      try {
        const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-processos-event": event.type, "x-processos-delivery": event.id, "x-processos-signature-256": signature }, body, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await this.prisma.webhookOutboxEvent.update({ where: { id: event.id }, data: { status: "DELIVERED", attempts: { increment: 1 }, deliveredAt: new Date(), lastError: null } });
        results.push({ id: event.id, delivered: true, status: response.status });
      } catch (error) {
        const attempts = event.attempts + 1;
        const delaySeconds = Math.min(3600, 2 ** attempts * 30);
        await this.prisma.webhookOutboxEvent.update({ where: { id: event.id }, data: { status: "FAILED", attempts, nextAttempt: new Date(Date.now() + delaySeconds * 1000), lastError: (error instanceof Error ? error.message : "Falha desconhecida").slice(0, 500) } });
        results.push({ id: event.id, delivered: false });
      }
    }
    return { attempted: events.length, delivered: results.filter((item) => item.delivered).length, results };
  }
}

@Controller("governance/review-webhooks")
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}
  @Post("dispatch") dispatch(@Headers() headers: Record<string, string | undefined>) { return this.webhooks.dispatch(headers); }
}
