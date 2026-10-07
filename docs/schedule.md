# M3 — Cronograma e progresso físico

O ScheduleModule reutiliza autenticação, ProjectService, RBAC e audit log de M1. Cada consulta operacional inclui tenant e obra. ADMIN gere qualquer obra do seu tenant; MANAGER precisa de atribuição ativa como MANAGER. Os restantes participantes leem. Baselines só podem ser criadas por ADMIN.

## Modelo e decisões

- Um cronograma principal não arquivado por obra, garantido por índice parcial. `status`: DRAFT, ACTIVE, COMPLETED, ARCHIVED. Arquivamento conserva tarefas e histórico.
- Tarefas possuem código único no cronograma, pai opcional, tipo SUMMARY/TASK/MILESTONE, datas lógicas DATE, progresso decimal, peso decimal, rubrica opcional e versão. DELETE cancela; não elimina dados. Remover primeiro dependências e cancelar filhos antes de cancelar um resumo.
- SUMMARY deriva datas planeadas e progresso dos descendentes. Só TASK e MILESTONE ativos participam na ponderação. Um SUMMARY não pode ter rubrica nem progresso manual.
- Duração TASK é `fim − início + 1`. MILESTONE exige a mesma data inicial/final e duração zero. Datas inválidas ou invertidas são rejeitadas.
- Dependências FS/SS/FF/SF e lag positivo/negativo são relações explícitas, sem reagendamento automático. A validação topológica impede auto-dependência e ciclos. Escritas estruturais bloqueiam o cronograma numa transação, impedindo ciclos criados por pedidos concorrentes.
- MANUAL normaliza pesos positivos das folhas no cálculo. Não é necessário ao utilizador arredondar a soma para exatamente 1; `normalizedWeight` devolve seis casas. Pesos zero são permitidos; baseline exige peso total positivo.
- BUDGET_VALUE ancora o cálculo numa revisão aprovada explicitamente selecionada. Uma revisão substituída continua válida como referência histórica. Novas aprovações orçamentais não alteram silenciosamente o cronograma. A rubrica só pode ser ITEM da mesma obra e cada rubrica só pode estar ligada a uma tarefa ativa do cronograma. Tarefas sem valor nessa revisão têm peso zero.
- Progresso físico = soma(peso × progresso real) / soma(pesos), usando Decimal.js. O progresso planeado considera dias inclusivos: antes do início 0, no fim ou depois 100, durante `dias decorridos / duração × 100`; marco muda de 0 para 100 na sua data.
- Estado temporal usa desvio em pontos percentuais: real 100 → COMPLETED; desvio < −5 → DELAYED; −5 ≤ desvio < 0 → AT_RISK; desvio > 5 → AHEAD; restantes → ON_TIME.
- Atualizações reais exigem `version`, data e progresso 0–100. Sem início real, a primeira atualização positiva usa a data informada. Aos 100%, o fim real assume a data da atualização, salvo data explícita válida. Não se aceita progresso futuro ou anterior ao último registo. Correções podem reduzir progresso, mantendo o histórico anterior.

## Baselines, histórico e worker

`schedule_baselines` e `schedule_baseline_tasks` guardam datas, duração, pesos normalizados, código e nome. Triggers PostgreSQL rejeitam UPDATE/DELETE. A comparação devolve datas originais/atuais e diferenças em dias; tarefas canceladas ficam identificadas sem data atual.

`task_progress_updates` é append-only, incluindo progresso anterior/novo, autor, data, notas e diário de origem. O worker BullMQ agenda `project-progress-snapshot` às 23:00 de Africa/Maputo, com três tentativas e backoff exponencial. O processador percorre cronogramas em lotes de 100 e faz upsert por obra/data, permitindo repetição sem duplicados.

## API

Prefixo `/api/v1/projects/:projectId`:

| Rota | Métodos |
| --- | --- |
| `/schedule` | GET, POST, PATCH |
| `/schedule/tasks` | GET paginado, POST |
| `/schedule/tasks/:taskId` | GET, PATCH, DELETE com version |
| `/schedule/tasks/:taskId/progress` | POST |
| `/schedule/dependencies` | POST |
| `/schedule/dependencies/:dependencyId` | DELETE |
| `/schedule/tree` | GET, conjunto plano com parentId e valores derivados |
| `/schedule/baselines` | GET, POST |
| `/schedule/variance?baselineId=…` | GET; default última baseline |
| `/progress` | GET, cartões operacionais |
| `/progress/history?page=1&limit=50` | GET, atualizações e últimos 366 snapshots |

Filtros de tarefas: `status`, `taskType`, `delayed`, `budgetItemId`, `search`, `referenceDate`, `page`, `limit` (máximo 200). Swagger inclui payloads, respostas e erros; valores decimais são strings.

## Interface e desempenho

`/projects/[id]/schedule` inclui cronograma editável, resumos expansíveis, Gantt simples, progresso, baseline e histórico. Tabelas mostram 50 tarefas por página. O cálculo usa mapas e percurso iterativo; não executa consultas por tarefa. A leitura carrega tarefas, valores da revisão e dependências em conjuntos. Testes de domínio e PostgreSQL exercitam 500, 2.000 e 5.000 tarefas; resultados efetivos ficam no relatório M3.

Não inclui caminho crítico, nivelamento automático de recursos, medições ou motor avançado de planeamento.
