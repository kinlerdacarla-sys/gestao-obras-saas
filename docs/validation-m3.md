# Validação M3 — 7 de outubro de 2026

## Implementado

Cronograma, hierarquia, dependências, baseline, progresso físico, histórico, snapshots BullMQ e diário de obra com recursos e anexos privados. M1/M2 foram validados antes das alterações: 55 unitários, 58 de integração, 5 E2E, lint, typecheck e build aprovados.

## Banco de dados

Duas migrations adicionais, `202610070005_execution` e `202610070006_execution_integrity`, criam 18 tabelas e reforçam chaves compostas por tenant/obra, unicidade, checks e imutabilidade. As seis migrations foram aplicadas desde zero no PostgreSQL de testes e na atualização da aplicação Docker. Seed idempotente repetido com sucesso. Nenhuma dependência de PostgreSQL ou Redis instalados no Windows.

## Cronograma

CRUD, folhas/resumos/marcos, dependências sem ciclos, pesos manuais normalizados ou ligados a revisão aprovada, progresso planeado/real, estados temporais, baseline imutável, comparação de datas, cancelamento lógico e optimistic locking. Resumos derivam progresso, datas planeadas/reais e estado dos descendentes. O worker real processou `project-progress-snapshot` com scheduler diário confirmado; [evidência](evidence/m3/worker.txt).

## Diário

Data única, meteorologia, atividades, mão de obra, equipamentos, materiais, entregas, ocorrências, fotografias, documentos e observações. Atualização atividade → tarefa transacional. DRAFT/REOPENED → SUBMITTED → APPROVED; reabertura exclusiva de ADMIN. Campos monetários/quantidades/horas usam decimais, sem cálculos monetários em ponto flutuante.

## API

ScheduleModule, DailyLogModule e DocumentModule ligados ao Nest. Swagger 3.0.0 documenta rotas, payloads, respostas e erros. API disponível em `/api/v1`, documentação em `/api/docs`. URLs temporárias de upload são assinadas e servidas pelo armazenamento privado da própria API; não foi configurado um bucket externo. Veja [schedule.md](schedule.md) e [daily-log.md](daily-log.md).

## Frontend

Cronograma com tabela expansível, filtros, paginação, Gantt simples e separadores; diário com formulários e cartões móveis; galerias filtradas; dashboard operacional. Teste móvel Chromium a 390 × 844 verificou ausência de overflow horizontal. [Cronograma](evidence/m3/schedule-desktop.png) e [diário móvel](evidence/m3/diary-mobile.png).

## Segurança

RBAC e autorização por obra; isolamento validado por tenant, rota e ID de recurso estrangeiro. Testes cobrem progresso e anexos, assinatura adulterada, bytes/checksum inválidos, concorrência, rollback, imutabilidade SQL e visibilidade CLIENT/FINANCIER. PUBLIC_PROJECT exige participante autenticado. Audit log existente reutilizado. Volume privado de documentos configurado no Compose. Não houve deploy em produção.

## Performance

Medições locais da suite Docker, não um SLA:

| Tarefas | Leitura da árvore/API | Criação de baseline |
| --- | ---: | ---: |
| 500 | 39 ms | 160 ms |
| 2.000 | 101 ms | 704 ms |
| 5.000 | 238 ms | 2.064 ms |

Sem consultas por tarefa. Percursos do domínio são iterativos. M2 continuou a passar os testes com 10.000 linhas XLSX. O driver pg emitiu aviso de depreciação durante insert em lote do Prisma; não houve falha. Não foi feita atualização de dependências fora da milestone.

## Testes

```text
Unit:        92 aprovados
Integration: 87 aprovados
E2E:          7 aprovados
Lint:        aprovado
Typecheck:   aprovado
Build:       aprovado
```

Os testes de integração incluem 29 casos M3; unitários incluem 37 casos M3. E2E mantém os cinco M1/M2 e acrescenta dois percursos completos M3: ADMIN cria cronograma/hierarquia/dependência/baseline/progresso; MANAGER regista diário móvel e fotografias, ADMIN aprova e CLIENT vê somente o conteúdo autorizado. [Log integral](evidence/m3/quality.txt).

A revisão visual dos separadores foi seguida de nova passagem de lint, tipos, build e dos 7 E2E ([log](evidence/m3/final-ui.txt)). O último reforço da validação de assinatura rejeita também caracteres não ASCII com 403, antes da comparação criptográfica; lint, tipos, os 29 testes M3 de integração e build foram repetidos ([log](evidence/m3/final-security.txt)).

## Docker e CI

`docker compose config` e `docker compose up --build -d --wait --wait-timeout 180` executados com sucesso. Postgres, Redis, API, web e worker healthy; `/health` confirma as três dependências. A imagem de validação instala dependências e Chromium no Linux; bancos de teste foram recriados antes da execução final. O Dockerfile agora preserva o cache de dependências e navegador quando apenas o código muda.

Pipeline existente executa install, generate, migrations, lint, typecheck, unit, integration, seed, build e E2E; inclui PostgreSQL/Redis e job adicional de arranque Compose. Sintaxe validada com actionlint 1.7.12. Repositório publicado em `kinlerdacarla-sys/gestao-obras-saas`, branch `main`. A execução remota [37615780833](https://github.com/kinlerdacarla-sys/gestao-obras-saas/actions/runs/37615780833), para o commit `c8b0f30a9a9db44b533039f355ffb337118789f5`, terminou com sucesso nos jobs `verify` e `compose-smoke`, incluindo E2E. Estado e etapas consultados pela API do GitHub nesta revalidação.

## Como testar manualmente

1. Abra `http://localhost:3000/login`. Empresa `construtora-demo`, utilizador `admin@example.com`, senha `Demo-Obras!2026`.
2. Abra **Edifício Demo → Cronograma**. Consulte pesos/progresso; abra **Baseline** e **Histórico**. Edite uma tarefa ou registe progresso.
3. Entre como `gestor@example.com`, mesma senha. Abra **Diário → Novo diário**, registe atividade e confirme explicitamente a atualização da tarefa.
4. Adicione trabalhadores, equipamento, materiais, entrega e ocorrência. Em **Fotografias**, envie imagens com INTERNAL e CLIENT_VISIBLE. Submeta.
5. ADMIN aprova. `cliente@example.com` consulta o diário aprovado e apenas a fotografia CLIENT_VISIBLE. Reabrir como ADMIN retira temporariamente esse diário da leitura externa.
6. Para repetir tudo em ambiente isolado: `docker compose --profile validation build tests` e `docker compose --profile validation run --rm tests`. O serviço prepara migrations, testes, seed e build automaticamente.

## Pendências

Nenhuma pendência identificada na revalidação do código M1 + M2 + M3. Nenhuma funcionalidade foi reimplementada e não houve deploy em produção.

## Revalidação do estado publicado — 7 de outubro de 2026

A árvore Git estava limpa e sincronizada com `origin/main`; o commit inicial, apesar do título mencionar M1/M2, já inclui o M3. Repetidos no Docker: configuração Compose, `up --build -d --wait`, seis migrations desde zero, seed, lint, typecheck, 92 unitários, 87 testes de integração, build de produção e 7 E2E. Todos aprovados. [Log desta execução](evidence/m3/revalidation.txt). PostgreSQL, Redis, API, Web e Worker healthy; `/health` devolveu API/PostgreSQL/Redis `up`.

Verificação adicional na base isolada: ligação de tarefa a rubrica e cronograma a revisão aprovada, ponderação `BUDGET_VALUE` e progresso calculado corretamente (`100.00%` para a única tarefa ligada). O worker real confirmou o scheduler diário e processou o job de snapshot com sucesso. Inspeção de Git confirmou `.env` ignorado e nenhuma chave privada versionada; esta atualização inclui apenas documentação e evidência, sem credenciais novas.
