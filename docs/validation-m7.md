# Validação M7 — 22 de outubro de 2026

## Ambiente e regressão

Validação reproduzível com Docker Desktop/WSL 2, Node 24, PostgreSQL 18 e Redis 8.2. Os testes usam serviços e armazenamento separados da aplicação. A regressão anterior ao M7 passou (172 unitários, 173 integração e 13 E2E), preservando a base M1–M6.

Regressão M1–M7: 180 testes unitários, 191 testes de integração e 18 E2E aprovados. Lint, typecheck e build de produção aprovados. As verificações específicas de M7 foram repetidas após as correções de exportação. Auditoria npm: zero vulnerabilidades após atualização corretiva do Vitest para 4.1.12.

Compose config e `docker compose up --build -d --wait --wait-timeout 240` executados com sucesso. PostgreSQL, Redis, API, Web e Worker healthy. `/health` devolveu API, PostgreSQL e Redis `up`. As 14 migrations estão aplicadas. Seed executado em base vazia e novamente em base existente; o cenário saudável usa R1 aprovado, preservando os valores do R0 substituído.

## Cobertura M7

- Fórmulas Decimal, denominadores zero, estados executivos e previsão com confiança.
- Isolamento entre tenants com nomes iguais; exclusão de obras não atribuídas; perfis efetivos e revogação antes de servir cache.
- Filtros, comparação, curva S, snapshots idempotentes e remoção de finanças para fiscal.
- Deduplicação, optimistic locking e auditoria de alertas; preferências, marcação de notificações e resumo diário limitado ao perfil atual na obra.
- Relatórios autorizados no pedido, worker e download; assinatura, requerente, revogação, alteração de visibilidade e ausência de dados estrangeiros.
- Fotos INTERNAL excluídas para os perfis externos; os ficheiros continuam privados.
- Email validado com transporte stream, incluindo preferências e prevenção de repetição após sucesso. Nenhum envio externo foi necessário.
- E2E nos cinco perfis, portal móvel do cliente, fotografias permitidas, financiamento, relatórios e regressão M1–M6.

Os nove tipos de relatório foram gerados pelo worker nos dois formatos e descarregados com sessão autenticada: 18 exportações verificadas. A revisão visual do PDF executivo verificou capa, secções, curva, valores, paginação e rodapés. O teste unitário verifica a serialização de Decimal e texto que se assemelha a fórmulas Excel.

## Performance medida

27 obras no tenant, 20 amostras, p95:

| Consulta            |    Tempo |
| ------------------- | -------: |
| Portfólio com cache |  9,38 ms |
| Obra com cache      |  8,71 ms |
| Obra sem cache      | 35,29 ms |

Valores observados no ambiente local de validação, sem garantia de latência em produção. A regressão também manteve os testes de escala M2/M3/M5/M6, incluindo 10 mil inspeções, 100 mil itens, 50 mil NCR e 100 mil ações corretivas.

## CI e reprodução

O workflow [Core SaaS CI](https://github.com/kinlerdacarla-sys/gestao-obras-saas/actions/workflows/ci.yml) executa install, generate, migrations, lint, typecheck, unitários, integração, seed, build e E2E. Um segundo job recria a aplicação via Compose em runner limpo, verifica saúde e migrations. Consulte a execução associada ao commit para o estado remoto exato; não existe etapa de deploy.

Reprodução local: comandos do [README](../README.md), secção M7. Logs, PDFs e ficheiros de inspeção ficam em `work/`, ignorado pelo Git. A revisão do commit excluiu `.env`, chaves privadas e tokens.

## Limites da validação

SMTP externo requer configuração do fornecedor e credenciais no ambiente de destino; foi validado o transporte local sem envio. A inspeção adicional da aba no navegador da aplicação foi bloqueada pela política do navegador. Os E2E automatizados ocorreram no ambiente isolado, e os PDFs foram inspecionados como ficheiros locais. Nenhum deploy em produção foi efetuado.
