import { Body, Controller, Delete, Get, Headers, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { GovernanceService } from "./governance.service.js";

@ApiTags("governança")
@Controller("governance/units/:unitId/delegates")
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}
  @Get() list(@Param("unitId") unitId: string, @Headers() headers: Record<string, string | undefined>) { return this.governance.list(unitId, headers); }
  @Put(":principalId") delegate(@Param("unitId") unitId: string, @Param("principalId") principalId: string, @Body() body: { capabilities: string[] }, @Headers() headers: Record<string, string | undefined>) { return this.governance.delegate(unitId, { principalId, capabilities: body.capabilities }, headers); }
  @Delete(":principalId") revoke(@Param("unitId") unitId: string, @Param("principalId") principalId: string, @Headers() headers: Record<string, string | undefined>) { return this.governance.revoke(unitId, principalId, headers); }
}
