# Entrega M2

## 1. Resumo

M2 implementado sobre M1, com orçamento hierárquico em MZN, R0 e revisões, workflow de aprovação, Excel assíncrono, preview corrigível, comparação, exportação, dashboard, auditoria e concorrência. Autenticação, tenancy, obras e contratos da API do M1 foram preservados. Sem módulos M3.

## 2. Migrations

- `202610070003_budget`: schema, enums, relações e índices.
- `202610070004_budget_integrity`: constraints e triggers de integridade/imutabilidade.

## 3. Modelos

Budget, BudgetItem, BudgetRevision, BudgetRevisionValue, BudgetImportJob e BudgetImportRow. Snapshot inclui valores e metadados, mantendo identidade estável e histórico.

## 4. API

Todos os endpoints pedidos foram adicionados, mais cancelamento de rascunho, correção/remapeamento de preview, retry e download do original. A [tabela completa de métodos e caminhos](budget.md#api) documenta o contrato. Swagger inclui requests, responses, decimais, árvore recursiva, paginação e erros.

## 5. Frontend

Páginas de orçamento, importação, revisões e comparação sob `/projects/[id]/budget`. Componentes BudgetTree, BudgetItemForm, BudgetDashboard e BudgetMetrics, com navegação, estados de carregamento e confirmação de ações destrutivas. Dashboard da obra integrado. Desktop e mobile inspecionados.

## 6. Excel

Upload preserva original e checksum; BullMQ processa ExcelJS fora do request. Staging separado, validação, mapeamento editável e preview filtrável. Confirmação transacional exige zero erros e versão atual. Falhas revertem todas as alterações. Template disponível por endpoint e exportação mantém hierarquia e precisão decimal.

## 7. Revisões

DRAFT → SUBMITTED → APPROVED ou REJECTED; DRAFT → CANCELLED. Aprovação nova torna anterior SUPERSEDED. Rejeição é preservada e pode originar nova cópia. Snapshots aprovados/submetidos não são editáveis; R0 nunca é substituído silenciosamente.

## 8. Segurança

Contexto autenticado fornece tenant. Cada rota verifica acesso ao projeto, papel e propriedade dos UUIDs. ADMIN aprova/rejeita; MANAGER atribuído edita/submete; outros papéis leem revisões aprovadas autorizadas. Constraints compostas reforçam isolamento; optimistic locking impede perda de alterações.

## 9. Testes

55 unitários, 58 integração e 5 E2E aprovados. Lint, typecheck e build de produção aprovados. Audit de dependências de produção: zero vulnerabilidades conhecidas. [Resultados e cobertura](validation-m2.md).

## 10. Performance

Fixtures de 1.000, 5.000 e 10.000 linhas. No último teste real com 10.000 linhas: processamento/preview 2.241 ms, confirmação 5.027 ms, árvore 228 ms, paginação/comparação 1.156 ms; submissão/aprovação/cópia 3.831 ms. [Metodologia e tabela completa](validation-m2.md#performance-postgresql--api--worker).

## 11. Como testar manualmente

Siga instalação, migrations e seed do [README](../README.md). Inicie API, web e worker. Faça login, abra Edifício Demo → Orçamento; R0 totaliza 1.325.000 MZN. Noutra obra, importe template, corrija preview, confirme, submeta e aprove. Crie R1, altere quantidade/preço, aprove e compare/exporte. Repita com cliente para verificar leitura. [Passos detalhados](budget.md#teste-manual).

## 12. Pendências

A validação Docker/WSL 2 foi concluída posteriormente: arranque limpo, migrations, seed, healthchecks e suite integral aprovados em Linux/Docker. [Evidências](infrastructure-validation.md). Resta somente executar o workflow remotamente no GitHub, pois este repositório local não tem remoto configurado. Os limites do MVP estão documentados.
