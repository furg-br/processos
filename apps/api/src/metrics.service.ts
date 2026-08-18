import { CallHandler, Controller, ExecutionContext, Get, Injectable, NestInterceptor, Res } from "@nestjs/common";
import type { Response } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { finalize } from "rxjs";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly requests = new Counter({ name: "processos_http_requests_total", help: "Requisições HTTP recebidas", labelNames: ["method", "route", "status"], registers: [this.registry] });
  readonly duration = new Histogram({ name: "processos_http_request_duration_seconds", help: "Duração das requisições HTTP", labelNames: ["method", "route", "status"], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [this.registry] });

  constructor() { collectDefaultMetrics({ register: this.registry, prefix: "processos_" }); }
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{ method: string; route?: { path?: string }; path?: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = process.hrtime.bigint();
    return next.handle().pipe(finalize(() => {
      const labels = { method: request.method, route: request.route?.path ?? request.path ?? "unknown", status: String(response.statusCode) };
      this.metrics.requests.inc(labels);
      this.metrics.duration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
    }));
  }
}

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  @Get()
  async get(@Res() response: Response) {
    response.setHeader("content-type", this.metrics.registry.contentType);
    response.send(await this.metrics.registry.metrics());
  }
}
