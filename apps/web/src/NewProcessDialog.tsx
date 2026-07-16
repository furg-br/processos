import { useEffect, useState, type FormEvent } from "react";
import {
  FurgActionRow, FurgButton, FurgDialog, FurgMessage, FurgSelect, FurgTextField,
} from "@furg/design-system/react";
import { EMPTY_BPMN_XML } from "@furg/processos-bpmn";
import type { CreateProcessInput, OrganizationUnit, Perspective, Visibility } from "@furg/processos-contracts";
import { createProcess, listOrganizations } from "./api";

type ProcessForm = Omit<CreateProcessInput, "bpmnXml" | "slug">;

const initialForm: ProcessForm = {
  title: "",
  description: "",
  category: "",
  audience: "",
  ownerUnitId: "",
  perspective: "AS_IS",
  visibility: "INTERNAL",
};

function escapeXmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function NewProcessDialog({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (process: { id: string; slug: string; title: string }) => Promise<void> | void;
}) {
  const [form, setForm] = useState<ProcessForm>(initialForm);
  const [organizations, setOrganizations] = useState<OrganizationUnit[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isOpen) return;
    setForm(initialForm);
    setError(undefined);
    setLoadingOrganizations(true);
    void listOrganizations()
      .then((items) => {
        setOrganizations(items);
        setForm((current) => ({ ...current, ownerUnitId: items[0]?.id ?? "" }));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades."))
      .finally(() => setLoadingOrganizations(false));
  }, [isOpen]);

  function update<K extends keyof ProcessForm>(field: K, value: ProcessForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const bpmnXml = EMPTY_BPMN_XML.replace('name="Novo processo"', `name="${escapeXmlAttribute(form.title.trim())}"`);
      const created = await createProcess({ ...form, bpmnXml });
      await onCreated(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o processo.");
    } finally {
      setSubmitting(false);
    }
  }

  return <FurgDialog
    description="Registre o contexto mínimo. O diagrama começa como um rascunho BPMN válido e pode ser remodelado em seguida."
    isOpen={isOpen}
    onClose={() => { if (!submitting) onClose(); }}
    title="Criar processo"
  >
    <form className="new-process-form" onSubmit={submit}>
      {error ? <div className="new-process-form__wide"><FurgMessage title="Processo não criado" message={error} tone="danger" /></div> : null}
      <FurgTextField autoFocus label="Nome do processo" maxLength={180} minLength={3} onChange={(event) => update("title", event.target.value)} placeholder="Ex.: Aquisição de material permanente" required value={form.title} />
      <FurgTextField label="Categoria" maxLength={120} minLength={2} onChange={(event) => update("category", event.target.value)} placeholder="Ex.: Compras e contratações" required value={form.category} />
      <div className="new-process-form__wide"><FurgTextField helperText="Explique o que inicia o processo e qual entrega ele produz." label="Resumo" maxLength={500} minLength={10} onChange={(event) => update("description", event.target.value)} placeholder="Descreva objetivo, início e resultado esperado" required value={form.description} /></div>
      <div className="new-process-form__wide"><FurgTextField label="Público atendido" maxLength={180} minLength={2} onChange={(event) => update("audience", event.target.value)} placeholder="Ex.: Unidades acadêmicas e administrativas" required value={form.audience} /></div>
      <FurgSelect disabled={loadingOrganizations || organizations.length === 0} helperText={loadingOrganizations ? "Carregando unidades..." : undefined} label="Unidade responsável" onChange={(event) => update("ownerUnitId", event.target.value)} options={organizations.map((unit) => ({ value: unit.id, label: `${unit.acronym} — ${unit.name}` }))} required value={form.ownerUnitId} />
      <FurgSelect label="Cenário inicial" onChange={(event) => update("perspective", event.target.value as Perspective)} options={[{ value: "AS_IS", label: "AS-IS — processo atual" }, { value: "TO_BE", label: "TO-BE — cenário futuro" }]} value={form.perspective} />
      <FurgSelect label="Visibilidade" onChange={(event) => update("visibility", event.target.value as Visibility)} options={[{ value: "INTERNAL", label: "Interno" }, { value: "PUBLIC", label: "Público" }, { value: "RESTRICTED", label: "Restrito" }]} value={form.visibility} />

      <section className="new-process-seed new-process-form__wide" aria-labelledby="initial-flow-title">
        <div><strong id="initial-flow-title">Primeiro traço do diagrama</strong><span>Você poderá excluir, renomear e conectar outros elementos.</span></div>
        <ol aria-label="Fluxo BPMN inicial"><li>Início</li><li>Descrever a atividade</li><li>Resultado entregue</li></ol>
      </section>

      <div className="new-process-form__actions new-process-form__wide"><FurgActionRow align="end"><FurgButton disabled={submitting} onClick={onClose} type="button" variant="text">Cancelar</FurgButton><FurgButton disabled={loadingOrganizations || organizations.length === 0} icon="document" loading={submitting} type="submit">Criar e abrir diagrama</FurgButton></FurgActionRow></div>
    </form>
  </FurgDialog>;
}
