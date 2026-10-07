# Validação M2 — 7 de outubro de 2026

**Atualização:** a pendência Docker deste relatório histórico foi resolvida numa validação posterior em Docker/WSL 2, com 55 unitários, 58 integrações e 5 E2E aprovados. Consulte o [relatório de infraestrutura](infrastructure-validation.md). Continua pendente apenas a execução remota do CI.

## Resultado

| Verificação                      | Resultado real                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| Baseline M1 antes das alterações | 25 unitários, 31 integração, 3 E2E; lint/typecheck aprovados       |
| `npm run lint`                   | Aprovado                                                           |
| `npm run typecheck`              | Aprovado: API/worker/packages, testes e frontend                   |
| `npm test`                       | **55/55 aprovados**                                                |
| `npm run test:integration`       | **58/58 aprovados**                                                |
| `npm run test:e2e`               | **5/5 aprovados**, Chromium                                        |
| `npm run build`                  | Aprovado: TypeScript + Next.js produção                            |
| `npm audit --omit=dev`           | 0 vulnerabilidades conhecidas no momento da execução               |
| Migrations + seed                | Aplicados ao PostgreSQL local; R0 demo aprovado de 1.325.000 MZN   |
| Inspeção visual                  | Desktop 1440 px e mobile 390 px; sem overflow horizontal da página |

Ambiente real: Windows, Node 24.19.0, npm 11.17.0, PostgreSQL 18.6 e Redis 8.2.10 locais. Integração usa PostgreSQL real, Redis database 15 e Worker BullMQ real; não usa mocks de persistência. E2E usa API, web e worker em execução. O build foi compilado em modo de produção; o navegador foi testado com o servidor de desenvolvimento.

## Cobertura relevante

- Precisão, HALF_UP, limites, soma de grupos sem dupla contagem, ciclos e limite de profundidade em ambas as ordens de entrada.
- R0 de 100.000 e R1 de 132.000 MZN; diferença 32.000, variação 32%; R0 e metadados preservados.
- Criação/edição/submissão/aprovação/rejeição, duplicação de rejeitada, supersessão, soft delete e reimportação com IDs estáveis.
- Trigger PostgreSQL rejeita mutação direta de snapshot aprovado.
- Dois updates concorrentes: exatamente um 200 e um 409.
- Upload, processamento no worker, preview, confirmação única, original preservado, edição de linha inválida e conflito de versão do preview.
- Falha de confirmação por rascunho existente: job permanece READY, não cria revisão e não regista confirmação parcial.
- ADMIN/MANAGER/INSPECTOR/FINANCIER/CLIENT e recursos de outro tenant/projeto.
- Swagger com esquema recursivo de árvore e comparação paginada.
- Fixtures geradas: válido, código duplicado, número inválido, hierarquia inválida e orçamento grande.
- E2E administrativo completo e cliente de leitura; os três testes E2E originais do M1 continuam a passar.

## Performance: domínio e XLSX

Medição local, milissegundos, com `npm test -- --reporter=verbose`. Cada fixture tem um grupo e N−1 itens. O primeiro tempo inclui geração do ficheiro e parsing. Não são garantias de latência de produção.

| Linhas | Gerar + ler XLSX | Validar + árvore + comparar | Exportar XLSX | Total |
| -----: | ---------------: | --------------------------: | ------------: | ----: |
|  1.000 |              110 |                          67 |            50 |   227 |
|  5.000 |              346 |                         226 |           211 |   784 |
| 10.000 |              612 |                         395 |           316 | 1.323 |

## Performance: PostgreSQL + API + worker

Última execução de `npm run test:integration -- --reporter=verbose`. Confirmação e cópia de revisões usam lotes sequenciais de 500. As consultas de árvore e comparação carregam conjuntos completos, sem N+1; a resposta de comparação é paginada.

| Linhas | Upload + worker + preview | Confirmar | Ler árvore | Listar página + comparar | Submeter + aprovar + copiar revisão |
| -----: | ------------------------: | --------: | ---------: | -----------------------: | ----------------------------------: |
|  1.000 |                    460 ms |    495 ms |      27 ms |                   114 ms |                              319 ms |
|  5.000 |                  1.358 ms |  2.360 ms |      84 ms |                   390 ms |                            1.428 ms |
| 10.000 |                  2.241 ms |  5.027 ms |     228 ms |                 1.156 ms |                            3.831 ms |

O fluxo de 10.000 linhas até às consultas levou 8.652 ms; submissão/aprovação/cópia foi medida separadamente. O teste verifica valores, contagem de snapshots, paginação e identidade, além do tempo. O limite de teste é 120 segundos para importação e consultas, sem esperar que diferentes máquinas reproduzam estes números.

## Evidência visual

- [Desktop](screenshots/budget-desktop.png)
- [Mobile](screenshots/budget-mobile.png)

## Limitações reais de validação

Docker/WSL não está instalado neste computador. O Compose foi atualizado com storage partilhado e dependências de arranque, mas não foi executado aqui. O workflow CI contém lint, typecheck, unit, integration, E2E e build; a execução remota no GitHub não foi realizada nesta sessão. Serviços e testes locais foram executados com PostgreSQL/Redis nativos.

Limites funcionais deliberados: primeira folha XLSX, 10.000 linhas por importação, valores literais sem fórmulas, 100 níveis e seletores UI com as 200 revisões mais recentes. A listagem paginada mantém acesso às revisões anteriores. Células monetárias exportadas são texto decimal exato. Ver [budget.md](budget.md).

As repetições locais dos E2E atingiram uma vez o limite de 20 logins/15 minutos do M1. Foram limpos somente os contadores de loopback e das duas contas demo no Redis local; a proteção da aplicação não foi alterada. A execução final passou.
