import { z } from "zod";
import {
  conformanceProfileSchema,
  evidenceStatusSchema,
  executionModeSchema,
  processBundleV2ApiVersion,
  resourceMetadataSchema,
  semanticKeySchema,
  sourceLocationSchema,
  visibilityV2Schema,
} from "./base.js";

const expressionLanguageSchema = z.enum(["CEL", "JSON_LOGIC", "FEEL", "NARRATIVE"]);

const envelope = <TKind extends string, TSpec extends z.ZodTypeAny>(kind: TKind, spec: TSpec) => z.object({
  apiVersion: z.literal(processBundleV2ApiVersion),
  kind: z.literal(kind),
  metadata: resourceMetadataSchema,
  spec,
});

export const processDefinitionResourceSchema = envelope("ProcessDefinition", z.object({
  definitionId: z.string().uuid(),
  processVersionId: z.string().uuid(),
  bindingSetVersionId: z.string().uuid(),
  releaseId: z.string().uuid(),
  profile: conformanceProfileSchema,
  perspective: z.enum(["AS_IS", "TO_BE"]),
  ownerUnitRef: semanticKeySchema,
  participantUnitRefs: z.array(semanticKeySchema).default([]),
  taxonomyRefs: z.array(semanticKeySchema).default([]),
  audienceRefs: z.array(semanticKeySchema).default([]),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  bpmnPath: z.literal("process/process.bpmn"),
  normativeBasisRefs: z.array(semanticKeySchema).default([]),
}));

export const phaseCatalogResourceSchema = envelope("PhaseCatalog", z.object({
  phases: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    description: z.string().optional(),
    elementRefs: z.array(semanticKeySchema).min(1),
    publicLabel: z.string().optional(),
    expectedDuration: z.string().optional(),
    order: z.number().int().nonnegative(),
  })).default([]),
}));

export const elementBindingCatalogResourceSchema = envelope("ElementBindingCatalog", z.object({
  elements: z.array(z.object({
    bpmnElementId: z.string().min(1),
    semanticId: semanticKeySchema,
    elementType: z.string().min(1),
    label: z.string().min(1),
    phaseRef: semanticKeySchema.optional(),
    visibility: visibilityV2Schema,
    publicLabel: z.string().optional(),
  })).min(1),
})).superRefine((resource, context) => {
  const semanticIds = new Set<string>();
  const bpmnIds = new Set<string>();
  resource.spec.elements.forEach((element, index) => {
    if (semanticIds.has(element.semanticId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["spec", "elements", index, "semanticId"], message: "Identificador semântico duplicado." });
    if (bpmnIds.has(element.bpmnElementId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["spec", "elements", index, "bpmnElementId"], message: "Elemento BPMN duplicado." });
    semanticIds.add(element.semanticId);
    bpmnIds.add(element.bpmnElementId);
  });
});

export const actionEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("STATE_TRANSITION"), stateMachineRef: semanticKeySchema.optional(), from: z.string().min(1), to: z.string().min(1) }),
  z.object({ type: z.literal("START_ACTIVITY"), activityRef: semanticKeySchema }),
  z.object({ type: z.literal("EMIT_EVENT"), eventRef: semanticKeySchema }),
  z.object({ type: z.literal("CREATE_DATA"), dataRef: semanticKeySchema }),
  z.object({ type: z.literal("UPDATE_DATA"), dataRef: semanticKeySchema }),
  z.object({ type: z.literal("GENERATE_DOCUMENT"), documentRef: semanticKeySchema }),
]);

export const completionActionSchema = z.object({
  key: semanticKeySchema,
  label: z.string().min(1),
  type: z.enum(["COMPLETE", "OUTCOME", "CANCEL", "RETRY"]),
  targetFlowRef: z.string().optional(),
  operationRefs: z.array(semanticKeySchema).default([]),
  formRefs: z.array(semanticKeySchema).default([]),
  policyRefs: z.array(semanticKeySchema).default([]),
  preconditions: z.array(z.object({ key: semanticKeySchema, expressionLanguage: expressionLanguageSchema, expression: z.string().min(1), description: z.string().min(1) })).default([]),
  effects: z.array(actionEffectSchema).default([]),
  evidenceRefs: z.array(semanticKeySchema).default([]),
});

export const operationalTraceabilityResourceSchema = envelope("OperationalTraceabilityCatalog", z.object({
  activities: z.array(z.object({
    activityRef: semanticKeySchema,
    executionMode: executionModeSchema,
    actorRefs: z.array(semanticKeySchema).default([]),
    organizationUnitRefs: z.array(semanticKeySchema).default([]),
    interactionPointRefs: z.array(semanticKeySchema).default([]),
    completionActions: z.array(completionActionSchema).default([]),
    inputRefs: z.array(semanticKeySchema).default([]),
    outputRefs: z.array(semanticKeySchema).default([]),
    timingPolicyRefs: z.array(semanticKeySchema).default([]),
    evidenceRefs: z.array(semanticKeySchema).default([]),
    externalProcedure: z.object({ location: z.string().min(1), procedureRef: semanticKeySchema.optional() }).optional(),
    mappingStatus: z.enum(["COMPLETE", "PARTIAL", "NOT_APPLICABLE", "UNKNOWN"]),
    gapReason: z.string().min(1).optional(),
  })).min(1),
}));

export const dataAssetCatalogResourceSchema = envelope("DataAssetCatalog", z.object({
  assets: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    kind: z.enum(["BUSINESS_CONCEPT", "INFORMATION_ASSET", "DOCUMENT", "FILE", "REFERENCE_CATALOG"]),
    ownerUnitRef: semanticKeySchema.optional(),
    stewardRef: semanticKeySchema.optional(),
    classification: visibilityV2Schema,
    schemaPath: z.string().optional(),
    authoritativeSourceRef: semanticKeySchema.optional(),
    retentionPolicy: z.string().optional(),
    evidenceRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
}));

export const formCatalogResourceSchema = envelope("FormCatalog", z.object({
  forms: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    version: z.string().min(1),
    dataSchemaRef: semanticKeySchema,
    uiSchemaDialect: z.string().min(1),
    activityRefs: z.array(semanticKeySchema).default([]),
    actionRefs: z.array(semanticKeySchema).default([]),
    audienceRefs: z.array(semanticKeySchema).default([]),
    fields: z.array(z.object({
      path: z.string().min(1),
      label: z.string().min(1),
      component: z.string().min(1),
      access: z.enum(["EDITABLE", "READ_ONLY", "DERIVED", "HIDDEN"]),
      policyRefs: z.array(semanticKeySchema).default([]),
      visibilityRule: z.string().optional(),
      requiredRule: z.string().optional(),
      ruleLanguage: expressionLanguageSchema.optional(),
    }).refine((field) => !(field.visibilityRule || field.requiredRule) || Boolean(field.ruleLanguage), { message: "Campo com regra deve declarar ruleLanguage." })).default([]),
    actions: z.array(semanticKeySchema).default([]),
  })).default([]),
}));

export const softwareCatalogResourceSchema = envelope("SoftwareCatalog", z.object({
  systems: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), ownerUnitRef: semanticKeySchema.optional(), description: z.string().optional() })).default([]),
  modules: z.array(z.object({ key: semanticKeySchema, systemRef: semanticKeySchema, label: z.string().min(1) })).default([]),
  entryPoints: z.array(z.object({
    key: semanticKeySchema,
    systemRef: semanticKeySchema,
    moduleRef: semanticKeySchema.optional(),
    label: z.string().min(1),
    screenRef: semanticKeySchema.optional(),
    menuPath: z.array(z.string().min(1)).default([]),
    environmentUrls: z.record(z.string().url()).default({}),
    evidenceRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
  operations: z.array(z.object({
    key: semanticKeySchema,
    systemRef: semanticKeySchema,
    moduleRef: semanticKeySchema.optional(),
    label: z.string().min(1),
    kind: z.enum(["HTTP", "UI_COMMAND", "MESSAGE", "CRON", "INTERNAL", "MANUAL"]),
    version: z.string().min(1),
    method: z.string().optional(),
    path: z.string().optional(),
    handler: z.string().optional(),
    deprecated: z.boolean().default(false),
    evidenceRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
}));

export const accessCatalogResourceSchema = envelope("AccessCatalog", z.object({
  actors: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), kind: z.enum(["PERSON", "AFFILIATION", "POSITION", "ORGANIZATIONAL_ROLE", "SYSTEM_ACTOR"]) })).default([]),
  profiles: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), groupRefs: z.array(semanticKeySchema).default([]), sourceSystemRef: semanticKeySchema.optional() })).default([]),
  groups: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), grantRefs: z.array(semanticKeySchema).default([]), sourceSystemRef: semanticKeySchema.optional() })).default([]),
  grants: z.array(z.object({ key: semanticKeySchema, subjectRefs: z.array(semanticKeySchema).min(1), actionRefs: z.array(semanticKeySchema).min(1), resourceRefs: z.array(semanticKeySchema).min(1), policyRefs: z.array(semanticKeySchema).default([]) })).default([]),
  policies: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    layer: z.enum(["CAPABILITY", "STATE", "RECORD_SCOPE", "FIELD_DOCUMENT"]),
    effect: z.enum(["ALLOW", "DENY"]),
    expressionLanguage: expressionLanguageSchema,
    expression: z.string().min(1),
    description: z.string().min(1),
    evidenceRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
}));

export const automationCatalogResourceSchema = envelope("AutomationCatalog", z.object({
  timingPolicies: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    kind: z.enum(["LEGAL_DEADLINE", "EXPECTED_DURATION", "INTERNAL_SLA"]),
    duration: z.string().min(1),
    calendarRef: semanticKeySchema.optional(),
    timezone: z.string().min(1),
    trigger: z.string().min(1),
    pauseConditions: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    publicLabel: z.string().optional(),
    normativeBasisRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
  jobs: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    schedule: z.string().min(1),
    timezone: z.string().min(1),
    operationRef: semanticKeySchema,
    executor: z.string().min(1),
    ownerUnitRef: semanticKeySchema,
    idempotency: z.string().min(1),
    concurrencyLock: z.string().min(1),
    retryPolicy: z.string().min(1),
    monitoring: z.string().min(1),
    configurationRequirements: z.array(z.string()).default([]),
    secretRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
  integrations: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), sourceSystemRef: semanticKeySchema, targetSystemRef: semanticKeySchema, operationRefs: z.array(semanticKeySchema).default([]), protocol: z.string().min(1) })).default([]),
}));

export const projectionCatalogResourceSchema = envelope("ProjectionCatalog", z.object({
  projections: z.array(z.object({
    key: semanticKeySchema,
    audience: z.enum(["PUBLIC", "INSTITUTIONAL", "TECHNICAL", "RESTRICTED"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    phases: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), description: z.string().min(1), internalElementRefs: z.array(semanticKeySchema).min(1), responsibleLabel: z.string().min(1), expectedDurationLabel: z.string().optional(), nextPhaseRefs: z.array(semanticKeySchema).default([]) })).default([]),
    excludedResourceRefs: z.array(semanticKeySchema).default([]),
  })).default([]),
}));

export const provenanceCatalogResourceSchema = envelope("ProvenanceCatalog", z.object({
  sourceArtifacts: z.array(z.object({
    key: semanticKeySchema,
    kind: z.enum(["SOURCE_CODE", "DATABASE", "TEST", "NORM", "PROCEDURE", "INTERVIEW", "RUNTIME_EVENT", "SCREENSHOT"]),
    label: z.string().min(1),
    location: sourceLocationSchema,
    capturedAt: z.string().datetime(),
  })).default([]),
  evidence: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    status: evidenceStatusSchema,
    confidence: z.number().min(0).max(1),
    sourceArtifactRefs: z.array(semanticKeySchema).min(1),
    validatesRefs: z.array(semanticKeySchema).default([]),
    validatedBy: z.string().optional(),
    validatedAt: z.string().datetime().optional(),
    discrepancy: z.string().optional(),
  })).default([]),
}));

export const processReleaseResourceSchema = envelope("ProcessRelease", z.object({
  releaseId: z.string().uuid(),
  processDefinitionRef: semanticKeySchema,
  processVersionId: z.string().uuid(),
  bindingSetVersionId: z.string().uuid(),
  publishedAt: z.string().datetime().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().optional(),
  sourceArtifactRefs: z.array(semanticKeySchema).default([]),
}));

export const institutionalContextCatalogResourceSchema = envelope("InstitutionalContextCatalog", z.object({
  organizationUnits: z.array(z.object({ key: semanticKeySchema, acronym: z.string().min(1), label: z.string().min(1), parentRef: semanticKeySchema.optional(), authoritativeSource: z.string().optional() })).default([]),
  affiliations: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), description: z.string().optional() })).default([]),
  positions: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), description: z.string().optional() })).default([]),
  domains: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), parentRef: semanticKeySchema.optional() })).default([]),
}));

export const decisionCatalogResourceSchema = envelope("DecisionCatalog", z.object({
  decisions: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    notation: z.enum(["DECLARATIVE", "DMN", "NARRATIVE"]),
    expressionLanguage: expressionLanguageSchema.optional(),
    expression: z.string().min(1).optional(),
    modelPath: z.string().min(1).optional(),
    activityRefs: z.array(semanticKeySchema).default([]),
    inputRefs: z.array(semanticKeySchema).default([]),
    outputRefs: z.array(semanticKeySchema).default([]),
    normativeBasisRefs: z.array(semanticKeySchema).default([]),
    evidenceRefs: z.array(semanticKeySchema).default([]),
  }).refine((decision) => decision.notation === "NARRATIVE" || Boolean(decision.expression || decision.modelPath), { message: "Decisão declarativa ou DMN exige expressão ou modelo." })
    .refine((decision) => !decision.expression || Boolean(decision.expressionLanguage), { message: "Decisão com expressão deve declarar expressionLanguage." })).default([]),
}));

export const stateCatalogResourceSchema = envelope("StateCatalog", z.object({
  machines: z.array(z.object({
    key: semanticKeySchema,
    label: z.string().min(1),
    subjectRef: semanticKeySchema,
    initialState: z.string().min(1),
    terminalStates: z.array(z.string().min(1)).default([]),
    states: z.array(z.string().min(1)).min(1),
    transitions: z.array(z.object({ key: semanticKeySchema, from: z.string().min(1), to: z.string().min(1), actionRef: semanticKeySchema.optional(), operationRef: semanticKeySchema.optional(), conditionRef: semanticKeySchema.optional() })).default([]),
  })).default([]),
}));

export const communicationCatalogResourceSchema = envelope("CommunicationCatalog", z.object({
  templates: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), channel: z.enum(["EMAIL", "IN_APP", "SMS", "DOCUMENT", "OTHER"]), templatePath: z.string().min(1).optional(), classification: visibilityV2Schema })).default([]),
  notifications: z.array(z.object({ key: semanticKeySchema, label: z.string().min(1), trigger: z.string().min(1), recipientRefs: z.array(semanticKeySchema).min(1), templateRef: semanticKeySchema, activityRefs: z.array(semanticKeySchema).default([]), evidenceRefs: z.array(semanticKeySchema).default([]) })).default([]),
}));

export const processBundleV2ResourceSchema = z.union([
  processDefinitionResourceSchema,
  phaseCatalogResourceSchema,
  elementBindingCatalogResourceSchema,
  operationalTraceabilityResourceSchema,
  dataAssetCatalogResourceSchema,
  formCatalogResourceSchema,
  softwareCatalogResourceSchema,
  accessCatalogResourceSchema,
  automationCatalogResourceSchema,
  projectionCatalogResourceSchema,
  provenanceCatalogResourceSchema,
  processReleaseResourceSchema,
  institutionalContextCatalogResourceSchema,
  decisionCatalogResourceSchema,
  stateCatalogResourceSchema,
  communicationCatalogResourceSchema,
]);

export type ProcessDefinitionResource = z.infer<typeof processDefinitionResourceSchema>;
export type PhaseCatalogResource = z.infer<typeof phaseCatalogResourceSchema>;
export type ElementBindingCatalogResource = z.infer<typeof elementBindingCatalogResourceSchema>;
export type OperationalTraceabilityResource = z.infer<typeof operationalTraceabilityResourceSchema>;
export type DataAssetCatalogResource = z.infer<typeof dataAssetCatalogResourceSchema>;
export type FormCatalogResource = z.infer<typeof formCatalogResourceSchema>;
export type SoftwareCatalogResource = z.infer<typeof softwareCatalogResourceSchema>;
export type AccessCatalogResource = z.infer<typeof accessCatalogResourceSchema>;
export type AutomationCatalogResource = z.infer<typeof automationCatalogResourceSchema>;
export type ProjectionCatalogResource = z.infer<typeof projectionCatalogResourceSchema>;
export type ProvenanceCatalogResource = z.infer<typeof provenanceCatalogResourceSchema>;
export type ProcessReleaseResource = z.infer<typeof processReleaseResourceSchema>;
export type InstitutionalContextCatalogResource = z.infer<typeof institutionalContextCatalogResourceSchema>;
export type DecisionCatalogResource = z.infer<typeof decisionCatalogResourceSchema>;
export type StateCatalogResource = z.infer<typeof stateCatalogResourceSchema>;
export type CommunicationCatalogResource = z.infer<typeof communicationCatalogResourceSchema>;
export type ProcessBundleV2Resource = z.infer<typeof processBundleV2ResourceSchema>;
