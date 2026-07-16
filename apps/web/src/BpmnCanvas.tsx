import { useEffect, useRef, useState } from "react";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import lintModule from "bpmn-js-bpmnlint";
import bpmnlintConfig from "./bpmnlint-config.js";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import { furgModdleDescriptor, validateBpmnXml, type BpmnValidationIssue } from "@furg/processos-bpmn";
import { FurgButton, FurgMessage } from "@furg/design-system/react";

type BpmnInstance = Modeler | NavigatedViewer;

export function BpmnCanvas({ editable, xml, onSave, onDirtyChange }: {
  editable: boolean;
  xml: string;
  onSave?: (xml: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<BpmnInstance | undefined>(undefined);
  const [issues, setIssues] = useState<BpmnValidationIssue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [guided, setGuided] = useState(true);
  const [fullscreenMode, setFullscreenMode] = useState<"none" | "native" | "fallback">("none");

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    setDirty(false);
    setMessage(undefined);
    let active = true;
    const instance = editable
      ? new Modeler({
        container: containerRef.current,
        moddleExtensions: { furg: furgModdleDescriptor },
        additionalModules: [lintModule],
        linting: { bpmnlint: bpmnlintConfig },
      })
      : new NavigatedViewer({ container: containerRef.current, moddleExtensions: { furg: furgModdleDescriptor } });
    instanceRef.current = instance;
    void instance.importXML(xml).then(() => {
      if (!active) return;
      instance.get<any>("canvas").zoom("fit-viewport");
      setIssues(validateBpmnXml(xml));
      if (editable) {
        instance.get<any>("linting").toggle(true);
        instance.get<any>("eventBus").on("commandStack.changed", () => setDirty(true));
      }
    }).catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; instance.destroy(); };
  // O modelador ativo mantém o XML de trabalho. A chave fornecida pela página
  // recria a instância apenas ao trocar de processo ou de modo de edição.
  }, [editable]);

  useEffect(() => {
    function refitCanvas() {
      window.requestAnimationFrame(() => {
        const canvas = instanceRef.current?.get<any>("canvas");
        canvas?.resized?.();
        canvas?.zoom?.("fit-viewport");
      });
    }
    function handleFullscreenChange() {
      if (document.fullscreenElement === workspaceRef.current) setFullscreenMode("native");
      else setFullscreenMode((current) => current === "native" ? "none" : current);
      refitCanvas();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement === workspaceRef.current) {
        void document.exitFullscreen().catch(() => undefined);
        return;
      }
      setFullscreenMode((current) => current === "fallback" ? "none" : current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleEscape);
    refitCanvas();
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [fullscreenMode]);

  async function toggleFullscreen() {
    if (fullscreenMode === "native") {
      await document.exitFullscreen().catch(() => setFullscreenMode("none"));
      return;
    }
    if (fullscreenMode === "fallback") {
      setFullscreenMode("none");
      return;
    }
    try {
      if (!workspaceRef.current?.requestFullscreen) throw new Error("Fullscreen API indisponível");
      await workspaceRef.current.requestFullscreen();
      setFullscreenMode("native");
    } catch {
      setFullscreenMode("fallback");
    }
  }

  async function handleSave() {
    if (!editable || !onSave || !(instanceRef.current instanceof Modeler)) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const { xml: nextXml } = await instanceRef.current.saveXML({ format: true });
      if (!nextXml) throw new Error("O editor não produziu o BPMN XML.");
      const nextIssues = validateBpmnXml(nextXml);
      setIssues(nextIssues);
      if (nextIssues.some((issue) => issue.severity === "error")) throw new Error("Corrija os erros de modelagem antes de salvar.");
      await onSave(nextXml);
      setDirty(false);
      setMessage("Rascunho salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }

  const fullscreen = fullscreenMode !== "none";

  return <div className={`bpmn-workspace ${guided ? "is-guided" : "is-advanced"} ${fullscreen ? "is-fullscreen" : ""} ${fullscreenMode === "fallback" ? "is-fullscreen-fallback" : ""}`} ref={workspaceRef}>
    <div className="bpmn-toolbar">
      <div><strong>{editable ? "Editor BPMN" : "Diagrama publicado"}</strong><span>{editable ? " Arraste elementos e conecte o fluxo." : " Use o mouse ou teclado para navegar."}</span></div>
      <div className="bpmn-toolbar__actions">{editable ? <FurgButton onClick={() => setGuided((value) => !value)} size="small" variant="text">{guided ? "Usar modo avançado" : "Usar modo guiado"}</FurgButton> : null}<FurgButton aria-pressed={fullscreen} icon={fullscreen ? "close" : "external"} onClick={toggleFullscreen} size="small" variant="text">{fullscreen ? "Sair da tela cheia" : "Tela cheia"}</FurgButton>{editable ? <FurgButton disabled={!dirty} icon="check" loading={saving} onClick={handleSave} size="small">Salvar rascunho</FurgButton> : null}</div>
    </div>
    {message ? <FurgMessage title={message === "Rascunho salvo." ? "Alterações salvas" : "Atenção"} message={message} tone={message === "Rascunho salvo." ? "success" : "warning"} /> : null}
    <div className="bpmn-canvas" ref={containerRef} aria-label={editable ? "Editor visual BPMN" : "Visualização do processo BPMN"} />
    {issues.length > 0 ? <section className="lint-panel" aria-live="polite"><strong>Qualidade do modelo</strong><ul>{issues.map((issue) => <li className={`lint-${issue.severity}`} key={`${issue.code}-${issue.elementId ?? "process"}`}>{issue.message}</li>)}</ul></section> : null}
  </div>;
}
