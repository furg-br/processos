import { BadRequestException, Injectable } from "@nestjs/common";
import type { VersionStatus } from "@furg/processos-contracts";

export type WorkflowAction =
  | "SUBMIT_UNIT"
  | "APPROVE_UNIT"
  | "APPROVE_CURATOR"
  | "REQUEST_CHANGES"
  | "ARCHIVE";

const transitions: Record<VersionStatus, Partial<Record<WorkflowAction, VersionStatus>>> = {
  DRAFT: { SUBMIT_UNIT: "UNIT_REVIEW" },
  CHANGES_REQUESTED: { SUBMIT_UNIT: "UNIT_REVIEW" },
  UNIT_REVIEW: { APPROVE_UNIT: "CURATOR_REVIEW", REQUEST_CHANGES: "CHANGES_REQUESTED" },
  CURATOR_REVIEW: { APPROVE_CURATOR: "PUBLISHED", REQUEST_CHANGES: "CHANGES_REQUESTED" },
  PUBLISHED: { ARCHIVE: "ARCHIVED" },
  SUPERSEDED: { ARCHIVE: "ARCHIVED" },
  ARCHIVED: {},
};

@Injectable()
export class WorkflowService {
  transition(status: VersionStatus, action: WorkflowAction): VersionStatus {
    const next = transitions[status]?.[action];
    if (!next) throw new BadRequestException(`A ação ${action} não é permitida quando a versão está em ${status}.`);
    return next;
  }
}
