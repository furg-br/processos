declare module "bpmn-moddle" {
  export default class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string, typeName?: string): Promise<{ rootElement: { $type?: string; rootElements?: unknown[] }; warnings: Array<{ message: string }> }>;
  }
}
