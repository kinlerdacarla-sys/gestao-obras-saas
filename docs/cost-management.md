# Gestão comercial e custos (M4)

Dashboard `/projects/[id]/costs`; APIs `/api/v1/projects/:projectId/costs/summary` e `/costs/items?page=1&limit=50`.

## Fórmulas e reconhecimento

- Orçamento aprovado: soma das folhas ativas da última revisão APPROVED da obra.
- Contratado original/atual: soma dos contratos ACTIVE, SUSPENDED, COMPLETED e TERMINATED. Contratos suspensos/concluídos/terminados preservam o compromisso histórico; terminar não apaga valores contratados. DRAFT/CANCELLED ficam excluídos.
- Adendas: apenas APPROVED nos contratos reconhecidos.
- Compromisso ativo (`committedCost`): valor atual apenas dos contratos ACTIVE; mostrado separadamente.
- Realizado (`approvedExpenses`): todas as despesas APPROVED.
- Despesa direta (`approvedDirectExpenses`): APPROVED sem contrato, com ou sem rubrica.
- Saldo (`remainingBudget`) = aprovado − contratado atual − despesas diretas aprovadas.

Uma despesa ligada a contrato é mostrada no realizado, mas não subtraída outra vez do saldo. Não existe indicador Pago nem saldo a pagar nesta milestone. Não foram implementados medições, certificação, financiamento, contabilidade ou pagamentos.

Por rubrica: `contractedValue` soma itens contratuais dos contratos reconhecidos; `approvedExpenseValue` soma despesas aprovadas ligadas à rubrica; `remainingValue = budgetValue − contractedValue − approvedDirectExpenses`; `variance = −remainingValue` (positivo indica excesso). Sobrecontratação é permitida e sinalizada com `BUDGET_ITEM_OVERCONTRACTED`. Adendas são valores do contrato sem rateio definido: afetam o resumo da obra, mas não são distribuídas artificialmente entre rubricas. O quadro por rubrica mostra explicitamente essa diferença.

Resumo e quadro usam transações RepeatableRead para uma visão financeira consistente. Agregações SQL evitam carregar todas as despesas/itens; listagens usam paginação. Índices incluem tenant/obra/status, data, fornecedor, contrato, centro e rubrica.

## Segurança e concorrência

Tenant vem da sessão; cada rota de obra passa pela autorização de participantes. FKs compostas reforçam tenant/obra no PostgreSQL. ADMIN gere e aprova; MANAGER com papel de gestão na obra cria/submete; FINANCIER lê contratos, adendas aprovadas e agregados; INSPECTOR lê contratos; CLIENT sem acesso comercial. Ausência de concessão explícita de despesas ao INSPECTOR significa acesso negado.

`PREVENT_SELF_APPROVAL=true` é padrão e está no `.env.example`/Compose. A regra aplica-se inclusive ao ADMIN; só outro ADMIN aprova. Alteração para false é uma decisão explícita de política da instalação.

Contratos e despesas usam version e locks transacionais. Itens usam a versão do contrato; adendas, fornecedores e centros também têm version. Aprovações de adendas serializam pelo contrato e recalculam o total a partir de todas as aprovadas. SQL protege original, estruturas de contrato ativo, adendas aprovadas, despesas aprovadas/estornadas e estornos. Audit log guarda transições e valores anteriores/novos. Correções não apagam histórico.

## Seed e execução

O seed idempotente expande Edifício Demo: Construções ABC, Betões Maputo, Electricidade XYZ; SUB-001 de 5.000.000 MZN, retenção 5%, adiantamento de 500.000 MZN, adenda aprovada +500.000 e atual 5.500.000; centros hierárquicos e despesas aprovadas. O novo ADMIN `diretor@example.com` permite demonstrar segregação usando a senha demo configurada. Seed bloqueado em produção.

Docker: `docker compose up --build -d --wait` executa migrations e seed na API. Validação Linux isolada: `docker compose --profile validation build tests` e `docker compose --profile validation run --rm tests`. O comando executa migrations, lint, tipos, unitários, integração, seed, build e E2E. O CI existente executa as mesmas verificações e um smoke Compose sem deploy.
