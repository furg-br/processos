import { useEffect, useState, type FormEvent } from "react";
import {
  FurgActionRow, FurgButton, FurgDialog, FurgMessage, FurgSelect, FurgTextField,
} from "@furg/design-system/react";
import type { OrganizationUnit, Perspective, ProcessDetail, UpdateProcessInput, Visibility } from "@furg/processos-contracts";
import { listOrganizations, updateProcessMetadata } from "./api";

function formFromProcess(process: ProcessDetail): UpdateProcessInput {
  return {
    title: process.title,
    description: process.description,
    category: process.category,
    audience: process.audience,
    ownerUnitId: process.ownerUnit.id ?? "",
    perspective: process.currentVersion?.perspective ?? "AS_IS",
    visibility: process.visibility,
  };
}

export function EditProcessDialog({ isOpen, process, onClose, onUpdated }: {
  isOpen: boolean;
  process: ProcessDetail;
  onClose: () => void;
  onUpdated: (process: ProcessDetail) => Promise<void> | void;
}) {
  const [form, setForm] = useState<UpdateProcessInput>(() => formFromProcess(process));
  const [organizations, setOrganizations] = useState<OrganizationUnit[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isOpen) return;
    setForm(formFromProcess(process));
    setError(undefined);
    setLoadingOrganizations(true);
    void listOrganizations()
      .then(setOrganizations)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades."))
      .finally(() => setLoadingOrganizations(false));
  }, [isOpen, process]);

  function update<K extends keyof UpdateProcessInput>(field: K, value: UpdateProcessInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const versionId = process.currentVersion?.id;
    if (!versionId) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const updated = await updateProcessMetadata(process.id, versionId, form);
      await onUpdated(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar os dados do processo.");
    } finally {
      setSubmitting(false);
    }
  }

  return <FurgDialog
    description="Revise o contexto cadastral do processo. O conteúdo do diagrama BPMN não será alterado."
    isOpen={isOpen}
    onClose={() => { if (!submitting) onClose(); }}
    title="Editar dados do processo"
  >
    <form className="new-process-form" onSubmit={submit}>
      {error ? <div className="new-process-form__wide"><FurgMessage title="Dados não atualizados" message={error} tone="danger" /></div> : null}
      <FurgTextField autoFocus label="Nome do processo" maxLength={180} minLength={3} onChange={(event) => update("title", event.target.value)} required value={form.title} />
      <FurgTextField label="Categoria" maxLength={120} minLength={2} onChange={(event) => update("category", event.target.value)} required value={form.category} />
      <div className="new-process-form__wide"><FurgTextField helperText="Explique o que inicia o processo e qual entrega ele produz." label="Resumo" maxLength={500} minLength={10} onChange={(event) => update("description", event.target.value)} required value={form.description} /></div>
      <div className="new-process-form__wide"><FurgTextField label="Público atendido" maxLength={180} minLength={2} onChange={(event) => update("audience", event.target.value)} required value={form.audience} /></div>
      <FurgSelect disabled={loadingOrganizations || organizations.length === 0} helperText={loadingOrganizations ? "Carregando unidades..." : undefined} label="Unidade responsável" onChange={(event) => update("ownerUnitId", event.target.value)} options={organizations.map((unit) => ({ value: unit.id, label: `${unit.acronym} - ${unit.name}` }))} required value={form.ownerUnitId} />
      <FurgSelect label="Cenário" onChange={(event) => update("perspective", event.target.value as Perspective)} options={[{ value: "AS_IS", label: "Processo atual" }, { value: "TO_BE", label: "Cenário futuro" }]} value={form.perspective} />
      <FurgSelect label="Visibilidade" onChange={(event) => update("visibility", event.target.value as Visibility)} options={[{ value: "INTERNAL", label: "Interno" }, { value: "PUBLIC", label: "Público" }, { value: "RESTRICTED", label: "Restrito" }]} value={form.visibility} />

      <div className="new-process-form__actions new-process-form__wide"><FurgActionRow align="end"><FurgButton disabled={submitting} onClick={onClose} type="button" variant="text">Cancelar</FurgButton><FurgButton disabled={loadingOrganizations || organizations.length === 0} icon="check" loading={submitting} type="submit">Salvar dados</FurgButton></FurgActionRow></div>
    </form>
  </FurgDialog>;
}
