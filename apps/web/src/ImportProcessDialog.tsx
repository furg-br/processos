import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  FurgActionRow, FurgButton, FurgDialog, FurgIcon, FurgMessage, FurgSelect, FurgTextField,
} from "@furg/design-system/react";
import type { OrganizationUnit } from "@furg/processos-contracts";
import { applyProcessBundle, dryRunProcessBundle, importProcess, listOrganizations, type BundleDryRunResult, type ImportProcessResult } from "./api";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

type ImportKind = "bundle" | "bpmn";

function kindFromFile(file: File): ImportKind | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) return "bundle";
  if (name.endsWith(".bpmn") || name.endsWith(".xml")) return "bpmn";
  return undefined;
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "processo-importado";
}

function titleFromFile(file: File) {
  return file.name.replace(/\.(bpmn|xml)$/i, "").replace(/[-_]+/g, " ").trim();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separator = result.indexOf(",");
      if (separator < 0) reject(new Error("Não foi possível preparar o arquivo para envio."));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ImportProcessDialog({ isOpen, onClose, onImported }: {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: ImportProcessResult) => Promise<void> | void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [kind, setKind] = useState<ImportKind>();
  const [title, setTitle] = useState("");
  const [ownerUnitId, setOwnerUnitId] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationUnit[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [dryRun, setDryRun] = useState<BundleDryRunResult>();
  const [unitMappingSelections, setUnitMappingSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setFile(undefined);
    setKind(undefined);
    setTitle("");
    setOwnerUnitId("");
    setOrganizations([]);
    setError(undefined);
    setDryRun(undefined);
    setUnitMappingSelections({});
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !kind || organizations.length > 0) return;
    setLoadingOrganizations(true);
    void listOrganizations()
      .then((items) => {
        setOrganizations(items);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades."))
      .finally(() => setLoadingOrganizations(false));
  }, [isOpen, kind, organizations.length]);

  function selectFile(nextFile?: File) {
    setError(undefined);
    setDryRun(undefined);
    setUnitMappingSelections({});
    if (!nextFile) {
      setFile(undefined);
      setKind(undefined);
      return;
    }
    const nextKind = kindFromFile(nextFile);
    if (!nextKind) {
      setError("Selecione um ProcessBundle ZIP ou um arquivo BPMN/XML.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("O arquivo excede o limite de 15 MB.");
      return;
    }
    setFile(nextFile);
    setKind(nextKind);
    if (nextKind === "bpmn") setTitle(titleFromFile(nextFile));
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !kind) return;
    if (kind === "bpmn" && (!ownerUnitId || !title.trim())) {
      setError("Informe a unidade responsável pelo processo.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const contentBase64 = await fileToBase64(file);
      if (kind === "bundle") {
        if (!dryRun) {
          const report = await dryRunProcessBundle({ fileName: file.name, contentBase64 });
          setDryRun(report);
          setUnitMappingSelections(Object.fromEntries(report.institutionalUnitMappings
            .filter((mapping) => mapping.resolvedUnit)
            .map((mapping) => [mapping.reference, mapping.resolvedUnit!.id])));
          if (!report.valid) setError("O pacote permanece em quarentena. Corrija os erros indicados e valide novamente.");
          return;
        }
        if (!dryRun.valid) return;
        const unitMappings = dryRun.institutionalUnitMappings.map((mapping) => ({
          reference: mapping.reference,
          role: mapping.role,
          unitId: unitMappingSelections[mapping.reference] ?? "",
        }));
        if (unitMappings.some((mapping) => !mapping.unitId)) {
          setError("Resolva todas as responsabilidades institucionais antes de importar.");
          return;
        }
        await onImported(await applyProcessBundle(dryRun.importId, unitMappings));
      } else {
        await onImported(await importProcess({ fileName: file.name, contentBase64, title: title.trim(), slug: slugify(title), ownerUnitId }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível importar o processo.");
    } finally {
      setSubmitting(false);
    }
  }

  const allInstitutionalUnitsMapped = Boolean(dryRun && dryRun.institutionalUnitMappings.length > 0
    && dryRun.institutionalUnitMappings.every((mapping) => unitMappingSelections[mapping.reference]));
  const canSubmit = Boolean(file && kind && (kind === "bundle"
    ? (!dryRun || (dryRun.valid && allInstitutionalUnitsMapped))
    : ownerUnitId && title.trim().length >= 3));

  return <FurgDialog
    description="Envie um pacote completo do catálogo ou um diagrama BPMN para iniciar um novo rascunho."
    isOpen={isOpen}
    onClose={() => { if (!submitting) onClose(); }}
    title="Importar processo"
  >
    <form className="import-process-form" onSubmit={submit}>
      {error ? <FurgMessage title="Processo não importado" message={error} tone="danger" /> : null}

      <label
        className={`process-upload${dragging ? " is-dragging" : ""}`}
        htmlFor={inputId}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input ref={inputRef} accept=".zip,.bpmn,.xml,application/zip,application/xml,text/xml" id={inputId} onChange={handleFileInput} type="file" />
        <span className="process-upload__icon"><FurgIcon name="upload" size={26} /></span>
        <span className="process-upload__copy">
          <strong>{file ? file.name : "Selecione ou arraste o arquivo"}</strong>
          <span>{file ? `${kind === "bundle" ? "ProcessBundle" : "BPMN 2.0"} · ${formatFileSize(file.size)}` : "ProcessBundle ZIP, BPMN ou XML · até 15 MB"}</span>
        </span>
        <span className="process-upload__action">{file ? "Trocar arquivo" : "Escolher arquivo"}</span>
      </label>

      {kind === "bundle" ? <section className="import-package-summary" aria-labelledby="bundle-import-title">
        <div><FurgIcon name="document" size={22} /><div><strong id="bundle-import-title">Pacote completo</strong><span>O processo será criado ou receberá uma nova versão em rascunho.</span></div></div>
        <ul><li>Quarentena e hashes</li><li>Referências cruzadas</li><li>Vínculos técnicos sob aprovação do CGTI</li></ul>
      </section> : null}

      {dryRun ? <section className={`bundle-validation-report ${dryRun.valid ? "is-valid" : "is-invalid"}`} aria-live="polite">
        <header><div><strong>{dryRun.valid ? "Pacote válido para importação" : "Pacote rejeitado na quarentena"}</strong><span>{dryRun.manifest ? `${dryRun.manifest.processDefinitionKey} · perfil ${dryRun.manifest.profile}` : "Manifesto não reconhecido"}</span></div><span>{dryRun.coverage.completeMappings}/{dryRun.coverage.bpmnActivities} atividades completas</span></header>
        <dl><div><dt>Operações</dt><dd>{dryRun.coverage.operations}</dd></div><div><dt>Formulários</dt><dd>{dryRun.coverage.forms}</dd></div><div><dt>Dados</dt><dd>{dryRun.coverage.dataAssets}</dd></div><div><dt>Fases públicas</dt><dd>{dryRun.coverage.publicPhases}</dd></div></dl>
        {dryRun.requiresCgtiApproval ? <p>Os vínculos técnicos serão importados como <strong>{dryRun.technicalBindingsWillBe === "APPROVED" ? "aprovados" : "pendentes de aprovação do CGTI"}</strong>.</p> : null}
        {dryRun.issues.length ? <ul>{dryRun.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.code}</strong> {issue.message}</li>)}</ul> : null}
        {dryRun.valid ? <section className="institutional-reconciliation" aria-labelledby="institutional-reconciliation-title">
          <header>
            <strong id="institutional-reconciliation-title">Responsabilidades institucionais</strong>
            <span>O pacote declara as referências; a plataforma confirma as unidades oficiais.</span>
          </header>
          <div className="institutional-reconciliation__list">
            {dryRun.institutionalUnitMappings.map((mapping) => <article key={mapping.reference} className={`institutional-mapping is-${mapping.status.toLowerCase()}`}>
              <div className="institutional-mapping__declaration">
                <span>{mapping.role === "OWNER" ? "Responsável pelo processo" : "Unidade participante"}</span>
                <strong>{mapping.bundleAcronym} - {mapping.bundleLabel}</strong>
                <code>{mapping.reference}</code>
              </div>
              <span className="institutional-mapping__arrow" aria-hidden="true">→</span>
              {mapping.status === "RESOLVED" && mapping.resolvedUnit ? <div className="institutional-mapping__resolution">
                <span>Correspondência confirmada</span>
                <strong>{mapping.resolvedUnit.acronym} - {mapping.resolvedUnit.name}</strong>
                <small>{mapping.resolvedUnit.externalId}</small>
              </div> : <FurgSelect
                disabled={loadingOrganizations || organizations.length === 0}
                helperText={mapping.status === "AMBIGUOUS" ? "Há mais de uma correspondência possível. A decisão exige administração da plataforma." : "Referência ainda não cadastrada. A decisão exige administração da plataforma."}
                label="Vincular à unidade oficial"
                onChange={(event) => setUnitMappingSelections((current) => ({ ...current, [mapping.reference]: event.target.value }))}
                options={[{ value: "", label: "Selecione uma unidade" }, ...organizations.map((unit) => ({ value: unit.id, label: `${unit.acronym} - ${unit.name}` }))]}
                required
                value={unitMappingSelections[mapping.reference] ?? ""}
              />}
            </article>)}
          </div>
        </section> : null}
      </section> : null}

      {kind === "bpmn" ? <section className="import-bpmn-fields" aria-labelledby="bpmn-import-title">
        <div><strong id="bpmn-import-title">Identificar o novo processo</strong><span>O BPMN puro não contém todos os dados do catálogo.</span></div>
        <FurgTextField autoFocus label="Nome do processo" maxLength={180} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} />
        <FurgSelect disabled={loadingOrganizations || organizations.length === 0} helperText={loadingOrganizations ? "Carregando unidades..." : "Escolha explicitamente a unidade que administrará o processo."} label="Unidade responsável" onChange={(event) => setOwnerUnitId(event.target.value)} options={[{ value: "", label: "Selecione uma unidade" }, ...organizations.map((unit) => ({ value: unit.id, label: `${unit.acronym} - ${unit.name}` }))]} required value={ownerUnitId} />
      </section> : null}

      <FurgActionRow align="end"><FurgButton disabled={submitting} onClick={onClose} type="button" variant="text">Cancelar</FurgButton><FurgButton disabled={!canSubmit || submitting} icon={kind === "bundle" && !dryRun ? "check" : "upload"} loading={submitting} type="submit">{kind === "bundle" && !dryRun ? "Validar sem importar" : "Importar e abrir"}</FurgButton></FurgActionRow>
    </form>
  </FurgDialog>;
}
