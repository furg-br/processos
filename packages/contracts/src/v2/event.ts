import { z } from "zod";
import { semanticKeySchema } from "./base.js";

export const processObservationEventSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string().uuid(),
  source: z.string().url(),
  type: z.string().regex(/^br\.furg\.processos\.[a-z0-9.-]+\.v\d+$/),
  subject: z.string().min(1),
  time: z.string().datetime(),
  datacontenttype: z.literal("application/json"),
  data: z.object({
    processReleaseId: z.string().uuid(),
    externalInstanceId: z.string().min(1),
    activitySemanticId: semanticKeySchema.optional(),
    milestoneSemanticId: semanticKeySchema.optional(),
    relatedObjectRefs: z.array(z.string().min(1)).default([]),
    currentDeadline: z.string().datetime().optional(),
    potentiallyAvailableActionRefs: z.array(semanticKeySchema).default([]),
  }).refine((data) => Boolean(data.activitySemanticId || data.milestoneSemanticId), { message: "O evento deve identificar uma atividade ou marco semântico." }),
});

export type ProcessObservationEvent = z.infer<typeof processObservationEventSchema>;
