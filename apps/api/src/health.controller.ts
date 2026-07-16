import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("operacional")
@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return { status: "ok", service: "processos-api", time: new Date().toISOString() };
  }
}
