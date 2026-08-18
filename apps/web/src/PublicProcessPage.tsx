import { useEffect, useState } from "react";
import { FurgAccordion, FurgChip, FurgMessage, FurgProgressIndicator } from "@furg/design-system/react";
import { getProcessV2Projection, type ProcessV2Projection } from "./api";

export function PublicProcessPage({ locator }: { locator: string }) {
  const [projectionDocument, setProjectionDocument] = useState<ProcessV2Projection>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void getProcessV2Projection(locator, "PUBLIC").then((value) => { if (active) setProjectionDocument(value); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Processo público indisponível."); });
    return () => { active = false; };
  }, [locator]);
  useEffect(() => { if (projectionDocument) globalThis.document.title = `${projectionDocument.process.title} - Processo público | FURG`; }, [projectionDocument]);
  if (error) return <main className="public-process-shell"><FurgMessage title="Processo público indisponível" message={error} tone="warning" /></main>;
  if (!projectionDocument?.projection) return <main className="public-process-shell"><FurgProgressIndicator label="Carregando processo público" /></main>;
  const projection = projectionDocument.projection;
  return <main className="public-process-shell">
    <header className="public-process-hero"><p className="eyebrow">Catálogo Institucional de Processos · FURG</p><FurgChip label="Visão pública" tone="success" /><h1>{projection.title}</h1><p>{projection.summary}</p><dl><div><dt>Unidade responsável</dt><dd>{projectionDocument.process.ownerUnit.name}</dd></div><div><dt>Publicação vigente</dt><dd>{projectionDocument.version.releaseId ?? "Vigente"}</dd></div></dl></header>
    <section aria-labelledby="public-phases-title" className="public-process-phases"><p className="eyebrow">Percurso simplificado</p><h2 id="public-phases-title">Fases, responsáveis e tempos esperados</h2><FurgAccordion ariaLabel="Fases do processo" items={projection.phases.map((phase, index) => ({ content: <div className="public-phase-detail"><p>{phase.description}</p><dl><div><dt>Responsável institucional</dt><dd>{phase.responsibleLabel}</dd></div><div><dt>Tempo esperado</dt><dd>{phase.expectedDurationLabel ?? "Consulte a unidade"}</dd></div><div><dt>Próxima fase</dt><dd>{phase.nextPhaseRefs.length ? phase.nextPhaseRefs.map((ref) => projection.phases.find((item) => item.key === ref)?.label ?? ref).join(", ") : "Conclusão"}</dd></div></dl></div>, id: phase.key, open: index === 0, title: `${String(index + 1).padStart(2, "0")} · ${phase.label}` }))} selectionMode="single" /></section>
    <footer><strong>Transparência por projeção</strong><p>Esta página contém apenas fases, responsáveis e tempos aprovados para divulgação. Detalhes técnicos e dados restritos não são carregados pelo navegador.</p></footer>
  </main>;
}
