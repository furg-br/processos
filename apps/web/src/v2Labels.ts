const technicalLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  ANALYZABLE: "Analisável",
  APPROVED: "Aprovado",
  AS_IS: "Estado atual",
  AUTOMATED: "Automática",
  BUSINESS_CONCEPT: "Conceito de negócio",
  CONTESTED: "Contestado",
  CRON: "Agendamento",
  DECLARATIVE: "Declarativa",
  DOCUMENT: "Documento",
  DOCUMENTARY: "Documental",
  DOCUMENTED: "Documentado",
  DRAFT: "Rascunho",
  EDITABLE: "Editável",
  EXECUTABLE: "Executável",
  FILE: "Arquivo",
  HIDDEN: "Oculto",
  HUMAN_EXTERNAL: "Pessoa fora da plataforma",
  HUMAN_UI: "Pessoa na aplicação",
  HYBRID: "Híbrida",
  IMPLEMENTABLE: "Implementável",
  IMPLEMENTED: "Implementado",
  INFORMATION_ASSET: "Ativo de informação",
  INSTITUTIONAL: "Institucional",
  INTEGRATION: "Integração",
  LEGAL_DEADLINE: "Prazo legal",
  MANUAL: "Procedimento manual",
  NARRATIVE: "Narrativa",
  NOT_REQUIRED: "Não exige aprovação",
  ORGANIZATIONAL_ROLE: "Papel organizacional",
  PENDING: "Pendente",
  PENDING_CGTI_APPROVAL: "Aguardando aprovação do CGTI",
  PROCEDURE: "Procedimento",
  PUBLIC: "Pública",
  READ_ONLY: "Somente leitura",
  REFERENCE_CATALOG: "Catálogo de referência",
  REJECTED: "Rejeitado",
  RESTRICTED: "Restrita",
  SOURCE_CODE: "Código-fonte",
  SYSTEM_ACTOR: "Ator sistêmico",
  TECHNICAL: "Técnica",
  TO_BE: "Estado futuro",
  UI_COMMAND: "Comando de interface",
  VALIDATED: "Validado",
  "file-upload": "Envio de arquivo",
  "text-field": "Campo de texto",
};

const formLabels: Record<string, string> = {
  FormAnaliseItensSelecionados: "Analisar itens selecionados",
  FormAtribuirResponsavelRsc: "Atribuir responsável pelo RSC",
  FormAvaliacaoDeferimentoRsc: "Avaliar deferimento do RSC",
  FormDiligenciaSeletivaRsc: "Abrir diligência seletiva do RSC",
  FormEnvioSeiRsc: "Enviar processo ao SEI",
  FormItemComissao: "Analisar item pela comissão",
  FormItemPedidoInserir: "Inserir item no pedido",
  FormItemServidor: "Alterar item do servidor",
  FormPedidoAlterar: "Alterar pedido",
  FormPedidoInserir: "Inserir pedido",
  FormResponderDiligenciaRsc: "Responder diligência do RSC",
};

export function technicalLabel(value?: string) {
  if (!value) return "Não informado";
  return technicalLabels[value] ?? value;
}

export function formLabel(value?: string) {
  if (!value) return "Formulário sem nome";
  if (formLabels[value]) return formLabels[value];
  const words = value.replace(/^Form/, "Formulário ").replace(/([a-zá-ú])([A-Z])/g, "$1 $2").trim();
  return words || value;
}

export function fieldLabel(value?: string) {
  if (!value) return "Campo sem nome";
  return value.replace(/\(read-only\)/gi, "(somente leitura)").replace(/\(conditional\)/gi, "(condicional)");
}
