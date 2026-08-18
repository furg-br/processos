# Threat model — ProcessBundle v2

Todo bundle é não confiável até concluir o dry-run. O upload não tem autoridade para publicar, criar unidades, conceder acesso ou aprovar vínculo com sistemas.

| Ameaça | Controle implementado |
| --- | --- |
| ZIP bomb | limites compactado, descompactado, por arquivo e por quantidade |
| path traversal / Zip Slip | rejeição de caminho absoluto, `..`, barra invertida e nome sanitizado divergente |
| arquivo omitido ou injetado | igualdade entre paths reais e manifesto |
| adulteração | SHA-256 e tamanho por arquivo |
| JSON ou recurso malformado | Zod e JSON Schemas públicos |
| schema de dados importado inválido | validação AJV em JSON Schema 2020-12 |
| XML incompatível ou XXE | rejeição de `DOCTYPE`/`ENTITY` e validação pelo metamodelo `bpmn-moddle` |
| conteúdo ativo | extensões executáveis e Markdown com construções inseguras são rejeitados; nada do pacote é executado |
| referência órfã | validação cruzada de BPMN, ações, operações, formulários, dados, prazos, acesso, decisões e estados |
| mutação parcial | quarentena e aplicação em transação serializável |
| escalada por catálogo importado | operações pendentes; somente `CGTI_ADMIN` aprova vínculo técnico |
| criação de unidade falsa | aplicação exige unidade existente ou escolha explícita |
| vazamento público | documento público separado, sem recursos internos |
| histórico reescrito | release imutável, arquivos e hashes preservados; alteração exige nova versão |
| inferência tratada como fato | status, confiança, fonte e divergência explícitos |
| falsificação de identidade | JWT verificado por JWKS, issuer, audience e expiração; headers de identidade externos são substituídos |
| privilégio por vínculo institucional amplo | claim administrativo separado por unidade e autorização reavaliada em cada mutação |
| webhook adulterado ou perdido | URL configurada pelo operador, HMAC, timeout, outbox transacional e retentativa exponencial |

Limites assumidos:

- malware em anexos binários deve ser tratado no gateway antes de ampliar os media types aceitos;
- autenticação de produção substitui cabeçalhos de desenvolvimento por identidade validada;
- autorização é reavaliada no backend;
- o v2 descreve capacidades, mas não concede autorização dinâmica no sistema de origem;
- a plataforma não executa scripts, DMN, handlers, URLs ou BPMN do pacote.

A suíte cobre adulteração, executáveis, XML inseguro, estrutura inválida, referências, identidade divergente, perdas de migração, round-trip e remoção de conteúdo interno da projeção pública. Novas classes de arquivo exigem limites e revisão deste documento.
