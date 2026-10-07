# M2 — Planeamento e Orçamento da Obra

## Modelo e migrations

O M1 mantém autenticação, cookies, autorização, tenant e contratos anteriores. O módulo Budget usa o mesmo monólito modular, Prisma, audit log e worker BullMQ.

Migrations incrementais:

- `202610070003_budget`: entidades, enums, relações compostas e índices.
- `202610070004_budget_integrity`: unicidade de orçamento ativo, revisão em preparação e revisão aprovada; constraints financeiras e triggers de imutabilidade.

Entidades Prisma: `Budget`, `BudgetItem`, `BudgetRevision`, `BudgetRevisionValue`, `BudgetImportJob`, `BudgetImportRow`.

Cada projeto tem um orçamento principal ACTIVE. BudgetItem é a identidade estável. BudgetRevisionValue guarda o snapshot completo, incluindo código, descrição, pai, unidade, tipo e ordem: mudar esses campos em R1 não altera R0. Remoção é lógica no snapshot. Nenhum histórico aprovado é apagado.

A árvore aceita até 100 níveis; pai tem de ser GROUP. Grupos não têm quantidade, unidade ou preço próprios. O backend recalcula ITEM = quantidade × preço, com decimal.js, precisão 48 e HALF_UP a duas casas. Os totais somam ITEM uma única vez; GROUP agrega descendentes. PostgreSQL usa NUMERIC(18,2) e NUMERIC(18,4). JSON transporta decimais como strings. Moeda única: MZN.

## Revisões e aprovação

A primeira revisão é R0. Uma nova revisão copia snapshots e conserva budgetItemId. Sequência crescente protegida por lock do orçamento. Só pode existir um DRAFT/SUBMITTED por orçamento.

- DRAFT → SUBMITTED → APPROVED.
- SUBMITTED → REJECTED; duplicar a rejeitada cria uma nova revisão, preservando a rejeição.
- DRAFT → CANCELLED.
- Ao aprovar outra revisão, a anterior passa de APPROVED para SUPERSEDED.

Apenas DRAFT permite edição. Triggers impedem alterações a snapshots submetidos/terminais e ao histórico das revisões. O único ajuste numa revisão anteriormente aprovada é o estado SUPERSEDED. Edições e transições exigem `version`; conflitos retornam 409 `RESOURCE_VERSION_CONFLICT`. A confirmação Excel também incrementa a versão do rascunho.

ADMIN aprova/rejeita; MANAGER atribuído à obra cria, edita e submete. INSPECTOR, FINANCIER e CLIENT atribuídos leem somente APPROVED/SUPERSEDED. O backend verifica tenant, acesso à obra e propriedade de revisionId, itemId e importJobId. Tenant nunca vem do corpo do pedido.

## API

Prefixo: `/api/v1/projects/:projectId/budget`. Swagger: `/api/docs` e `/api/docs-json` em desenvolvimento/testes.

| Método         | Sufixo                                             | Operação                        |
| -------------- | -------------------------------------------------- | ------------------------------- |
| GET / POST     | `/`                                                | Resumo / criar orçamento e R0   |
| GET            | `/tree?revisionId=`                                | Árvore completa                 |
| GET / POST     | `/items`                                           | Listar / criar item em rascunho |
| PATCH / DELETE | `/items/:itemId`                                   | Editar / desativar no snapshot  |
| GET / POST     | `/revisions`                                       | Listar / duplicar revisão       |
| GET / PATCH    | `/revisions/:revisionId`                           | Consultar árvore / descrição    |
| POST           | `/revisions/:revisionId/submit`                    | Submeter                        |
| POST           | `/revisions/:revisionId/approve`                   | Aprovar                         |
| POST           | `/revisions/:revisionId/reject`                    | Rejeitar, com motivo            |
| POST           | `/revisions/:revisionId/cancel`                    | Cancelar rascunho               |
| GET            | `/revisions/compare?fromRevisionId=&toRevisionId=` | Comparar                        |
| GET            | `/revisions/:revisionId/export`                    | XLSX                            |
| GET            | `/import/template`                                 | Template com exemplos           |
| POST           | `/imports`                                         | Multipart, campo `file`         |
| GET            | `/imports/:importJobId`                            | Estado e preview                |
| PATCH          | `/imports/:importJobId/mapping`                    | Remapear colunas                |
| PATCH          | `/imports/:importJobId/rows/:rowNumber`            | Corrigir linha                  |
| POST           | `/imports/:importJobId/confirm`                    | Confirmar atomicamente          |
| POST           | `/imports/:importJobId/retry`                      | Reenfileirar falha              |
| GET            | `/imports/:importJobId/original`                   | Original preservado             |

Listagens de itens, revisões, linhas de preview e comparação usam `page`/`limit` (default 50, máximo 200), com `data` e `meta`. Na comparação, os totais correspondem à revisão completa; `data` contém a página de alterações. O preview admite `status=VALID|WARNING|INVALID`. A árvore é completa e obtida sem consultas por item.

## Excel: upload até confirmação

1. API limita o upload a 10 MiB, verifica extensão/assinatura e grava o original com SHA-256 em `tenant/{tenantId}/projects/{projectId}/budget/imports/{importJobId}/original.xlsx`.
2. Cria job UPLOADED e enfileira `parse-budget-xlsx` em `budget-import`.
3. Worker verifica checksum e estrutura ZIP antes de ExcelJS: máximo 64 MiB descomprimidos, 2.000 entradas, 10.000 linhas de dados, 50 colunas e 5.000 caracteres por célula. Fórmulas são rejeitadas. Lê a primeira folha; não avalia fórmulas ou macros.
4. Usa cabeçalhos Código, Descrição, Unidade, Quantidade, Preço Unitário. Tipo e Código Pai são opcionais. Código Pai explícito tem prioridade; caso contrário infere pelo código pontuado. Incerteza gera warning corrigível.
5. Persiste linhas de staging, células originais, campos mapeados, erros, contagens e valor previsto. Preview permite paginação, filtros, correções e remapeamento com versionamento.
6. Confirmação exige READY, versão atual e zero erros. Revalida todas as linhas numa transação; cria orçamento/revisão, identidades e snapshots em lotes de 500, audit log e estado CONFIRMED. Qualquer falha faz rollback integral, incluindo estado do import job e numeração.

Um rascunho vazio pode receber a primeira importação. Um rascunho com itens bloqueia a confirmação: deve ser concluído ou cancelado. Reimportar sobre um orçamento aprovado cria outra revisão. Códigos conhecidos reutilizam identidades; códigos novos criam identidades. Renomeações devem ser feitas na edição para conservar a identidade; o XLSX não transporta UUID. Trocar GROUP por ITEM com a mesma identidade é rejeitado.

Retries: 3 tentativas, backoff exponencial a partir de 1 s. Identificador da fila inclui job e versão; confirmações duplicadas são rejeitadas. Processamento repetido substitui staging transacionalmente e não duplica snapshots. São mantidos os últimos 1.000 jobs concluídos e falhados. Logs do worker indicam falhas e progresso. Reinício do worker recupera jobs stalled pelo BullMQ.

`BUDGET_STORAGE_PATH` deve apontar para armazenamento partilhado por API/worker. Default local: `work/budget-storage`; Compose usa volume `budget_storage`. Backups devem incluir PostgreSQL e esse volume. O ficheiro original permanece mesmo após correções no preview.

Exportação preserva ordem e hierarquia, grupos em negrito, cabeçalho fixo e filtros. Valores são células de texto decimal para preservar exatamente até 18 dígitos, sem conversão IEEE-754 do Excel. O ficheiro pode ser reimportado. Nome: `Orcamento_<codigo>_<revisao>.xlsx`.

## Comparação, frontend e dashboard

Rotas `/projects/[id]/budget`, `/import`, `/revisions`, `/compare` sob budget. Componentes: BudgetPage, BudgetTree, BudgetItemForm, ImportPage, RevisionsPage, ComparePage, BudgetDashboard, BudgetMetrics e BudgetNavigation.

Árvore expansível com renderização incremental de 200 linhas; revisão e preview paginados. Valores no formato `1.250.000,00 MZN`. Estados de loading/erro, confirmação para aprovação/cancelamento/desativação e ausência de ações de edição para leitura. Dashboard da obra mostra original, atual, variação e revisão aprovada.

Comparação usa identidade estável e classifica ADDED, REMOVED, UNCHANGED, QUANTITY_CHANGED, PRICE_CHANGED, QUANTITY_AND_PRICE_CHANGED. Alterações de descrição/pai/unidade são sinalizadas separadamente. Percentagem é null quando a base é zero e o valor novo não é; UI mostra “Sem base”.

## Auditoria

Criação/edição/desativação de itens, revisões, submissão/aprovação/rejeição/cancelamento, upload/falha/correção/confirmação e exportação são auditados. Alterações manuais contêm old/new values. Importações registam eventos agregados por operação com códigos afetados e referências aos snapshots anterior/novo, evitando 10.000 inserts individuais de auditoria. Aprovação inclui utilizador, instante, revisão e valor. O audit log do M1 continua imutável.

## Teste manual

1. Executar instalação/migrations/seed do README e iniciar API, web e worker.
2. Entrar como `admin@example.com`, empresa `construtora-demo`, password definida por DEMO_PASSWORD.
3. Abrir Edifício Demo → Orçamento: R0 aprovado deve totalizar **1.325.000,00 MZN**.
4. Para testar R0 do início, criar outra obra e abrir Orçamento → Importar Excel → descarregar template.
5. Carregar XLSX; aguardar preview; provocar/corrigir um número inválido e verificar bloqueio da confirmação.
6. Confirmar → R0 DRAFT → Submeter → Aprovar. Verificar que edição desaparece.
7. Criar nova revisão → editar quantidade/preço → Submeter → Aprovar.
8. Comparar R0/R1 e exportar. R0 deve manter valores e descrição originais.
9. Exemplo automatizado: 100 × 1.000 = 100.000; R1 com 120 × 1.100 = 132.000; diferença 32.000 e 32%.
10. Entrar como `cliente@example.com`: consultar orçamento aprovado da obra atribuída, sem importar/editar/aprovar.
11. Em dois separadores, editar o mesmo DRAFT: a segunda gravação desatualizada deve retornar conflito.

## Decisões e limites

Sem medições, contratos, despesas, pagamentos, financiamento, diário, fiscalização ativa ou cronograma detalhado. Não há multi-moeda. O enum CANCELLED da importação fica reservado; o MVP permite cancelar revisões, sem endpoint para cancelar jobs.

Os seletores da interface carregam as 200 revisões mais recentes; revisões mais antigas continuam acessíveis pela listagem paginada e API. O limite Excel é 10.000 linhas incluindo grupos. Estas escolhas limitam uso de memória e complexidade do MVP.

Referências técnicas: [ExcelJS](https://github.com/exceljs/exceljs), [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs).
