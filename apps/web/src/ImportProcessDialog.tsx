import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  FurgActionRow, FurgButton, FurgDialog, FurgIcon, FurgMessage, FurgSelect, FurgTextField,
} from "@furg/design-system/react";
import type { OrganizationUnit } from "@furg/processos-contracts";
import { importProcess, listOrganizations, type ImportProcessResult } from "./api";

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

  useEffect(() => {
    if (!isOpen) return;
    setFile(undefined);
    setKind(undefined);
    setTitle("");
    setOwnerUnitId("");
    setOrganizations([]);
    setError(undefined);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || kind !== "bpmn" || organizations.length > 0) return;
    setLoadingOrganizations(true);
    void listOrganizations()
      .then((items) => {
        setOrganizations(items);
        setOwnerUnitId(items[0]?.id ?? "");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as unidades."))
      .finally(() => setLoadingOrganizations(false));
  }, [isOpen, kind, organizations.length]);

  function selectFile(nextFile?: File) {
    setError(undefined);
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
    if (kind === "bpmn" && (!title.trim() || !ownerUnitId)) {
      setError("Informe o nome e a unidade responsável pelo processo BPMN.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const contentBase64 = await fileToBase64(file);
      const result = await importProcess({
        fileName: file.name,
        contentBase64,
        ...(kind === "bpmn" ? { title: title.trim(), slug: slugify(title), ownerUnitId } : {}),
      });
      await onImported(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível importar o processo.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(file && kind && (kind === "bundle" || (title.trim().length >= 3 && ownerUnitId)));

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
        <ul><li>Diagrama BPMN</li><li>Metadados e versões</li><li>Relações e schemas disponíveis</li></ul>
      </section> : null}

      {kind === "bpmn" ? <section className="import-bpmn-fields" aria-labelledby="bpmn-import-title">
        <div><strong id="bpmn-import-title">Identificar o novo processo</strong><span>O BPMN puro não contém todos os dados do catálogo.</span></div>
        <FurgTextField autoFocus label="Nome do processo" maxLength={180} minLength={3} onChange={(event) => setTitle(event.target.value)} required value={title} />
        <FurgSelect disabled={loadingOrganizations || organizations.length === 0} helperText={loadingOrganizations ? "Carregando unidades..." : undefined} label="Unidade responsável" onChange={(event) => setOwnerUnitId(event.target.value)} options={organizations.map((unit) => ({ value: unit.id, label: `${unit.acronym} — ${unit.name}` }))} required value={ownerUnitId} />
      </section> : null}

      <FurgActionRow align="end"><FurgButton disabled={submitting} onClick={onClose} type="button" variant="text">Cancelar</FurgButton><FurgButton disabled={!canSubmit || submitting} icon="upload" loading={submitting} type="submit">Importar e abrir</FurgButton></FurgActionRow>
    </form>
  </FurgDialog>;
}
