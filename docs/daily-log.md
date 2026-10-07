# M3 — Diário de obra e documentos privados

## Modelo e workflow

Um diário por obra/data, com restrição UNIQUE no PostgreSQL. `log_date` é DATE; submissão, aprovação, upload e auditoria usam TIMESTAMPTZ. O diário contém meteorologia, temperaturas, notas, atividades, mão de obra, equipamentos, materiais, entregas, ocorrências, fotografias, documentos e observações.

Fluxo: DRAFT → SUBMITTED → APPROVED. Só ADMIN aprova ou reabre: APPROVED → REOPENED → SUBMITTED → APPROVED. DRAFT/REOPENED permitem edição por ADMIN ou MANAGER atribuído. SUBMITTED/APPROVED são bloqueados. Reabertura conserva datas/autor da aprovação anterior e o audit log; a aprovação seguinte gera novo evento. Triggers bloqueiam alterações aos filhos de diários fechados, alteração de conteúdo aprovado e eliminação de diários aprovados/submetidos.

Cada alteração inclui a versão corrente do diário. A transação incrementa essa versão; pedidos concorrentes recebem `409 RESOURCE_VERSION_CONFLICT`. O cliente deve recarregar e reconciliar a alteração. A interface guarda notas gerais ao sair do campo e informa alterações pendentes; os restantes formulários têm confirmação explícita. Não há escrita silenciosa do progresso.

## Atividades e recursos

Atividades podem referenciar tarefa, ITEM orçamental, ambos ou nenhum. Para atualizar uma tarefa, enviar `updateTaskProgress: true`, `progressAfter` e `taskVersion`. Criar atividade, reclamar versão do diário, atualizar tarefa, gravar TaskProgressUpdate e auditoria acontece numa só transação. Um conflito reverte tudo. A edição posterior da descrição/quantidade não reescreve progresso histórico; uma correção do progresso é um novo registo.

Mão de obra soma trabalhadores e calcula homem-hora com Decimal.js. Horas por trabalhador e horas totais de equipamento não ultrapassam 24. Materiais são consumo/registo operacional, sem stock. Entregas permitem referência documental, recebedor e hora lógica. Ocorrências têm tipo e gravidade. INSPECTOR pode acrescentar observações a diários editáveis, sem editar orçamento ou recursos.

## Fotografias e DocumentModule

M1/M2 não tinham DocumentModule. Foi criado um módulo partilhado, reutilizado pelos anexos do diário. Metadados comuns ficam em `documents`; `daily_log_photos` e `daily_log_documents` ligam os ficheiros ao diário. O adapter desta milestone usa armazenamento privado no filesystem/volume Docker, sem diretório público e sem necessidade de uma conta externa.

Fluxo do navegador:

1. POST `photos` ou `documents` com versão, nome, MIME, tamanho, SHA-256 e visibilidade.
2. Servidor verifica autorização, gera UUID/chave e uma URL assinada de upload com validade de 10 minutos, vinculada ao criador autenticado.
3. Navegador envia diretamente ao endpoint de armazenamento por PUT multipart, campo `file`.
4. POST `documents/:id/confirm`, com a versão devolvida pelo ticket, confirma o upload após verificar bytes, tamanho, MIME/magic e SHA-256. Só ficheiros confirmados aparecem nas consultas.

A URL assinada é servida pelo DocumentModule da própria API, não por um bucket S3 externo. Não aceitar `objectKey` do cliente. Escrita `wx` evita sobrescrever objetos. Repetir upload idêntico é seguro; confirmação exige ticket válido e versão. Uploads incompletos ficam privados e invisíveis; a remoção é lógica, preservando evidência. Retenção/limpeza física pode ser uma política operacional posterior.

Chaves: `tenant/{tenantId}/projects/{projectId}/daily-logs/{YYYY}/{MM}/{DD}/photos/{uuid}.{ext}`, ou `documents/`. `DOCUMENT_STORAGE_PATH` default `work/document-storage`; Compose usa volume `document_storage` em `/data/document-storage`. É necessário persistir esse volume junto com o PostgreSQL. Numa instalação com várias réplicas da API, o diretório deverá ser partilhado ou substituído por adapter de object storage.

Formatos: JPEG/JPG, PNG, WebP e PDF, máximo 20 MiB. Fotografias aceitam apenas imagens. Extensão/MIME, assinatura inicial, tamanho real e checksum são validados. Download exige novamente sessão, tenant, obra, estado do diário e visibilidade. Respostas não permitem cache público. Não há links públicos permanentes.

| Visibilidade | Leitores |
| --- | --- |
| INTERNAL | ADMIN e MANAGER autorizado |
| PROJECT_MEMBERS | Gestão e INSPECTOR |
| CLIENT_VISIBLE | Gestão, INSPECTOR e CLIENT |
| FINANCIER_VISIBLE | Gestão, INSPECTOR e FINANCIER |
| PUBLIC_PROJECT | Todos os participantes autorizados da obra |

CLIENT/FINANCIER só leem diários APPROVED; isso corresponde à publicação operacional nesta milestone. PUBLIC_PROJECT nunca significa Internet pública. Um cliente deixa de ver o diário enquanto estiver REOPENED. A interface usa os mesmos resultados filtrados para contagens, galerias e dashboard.

## API e interface

Prefixo `/api/v1/projects/:projectId/daily-logs`: GET paginado, POST; `/:id` GET/PATCH; `/:id/summary` GET; `/:id/submit`, `/approve`, `/reopen` POST. Subrotas de criação: activities, workforce, equipment, materials, deliveries, occurrences, observations, photos, documents. Atividade também permite PATCH `activities/:activityId`. GET photos/documents lista apenas anexos autorizados. PUT documents/:id/upload, POST documents/:id/confirm, GET documents/:id/content e DELETE documents/:id completam o fluxo.

Filtros: from/to (YYYY-MM-DD), status, createdBy, hasOccurrences, page, limit (máximo 100). A lista agrega contagens por conjuntos, sem N+1 por diário. Detalhes usam um número fixo de consultas por categoria.

Páginas: `/projects/[id]/daily-logs` e `/projects/[id]/daily-logs/[logId]`. Cartões e formulários adaptam-se ao telemóvel. O campo de fotografia oferece `capture="environment"`; navegador/dispositivo decide se abre câmara ou seletor. O seed inclui três diários anteriores aprovados.

Eventos de auditoria incluem criação/edição/submissão/aprovação/reabertura, atividades, recursos, ocorrências, observações, upload e remoção de anexos. Não inclui contratos, pagamentos, stock, inspeções formais ou não conformidades.
