# Validação M5 — 13 de outubro de 2026

M1–M4 foram validados antes da implementação (127 unitários, 115 integração, 9 E2E). A M5 preserva os módulos anteriores e acrescenta medições, certificação, retenções, recuperação de adiantamentos, financiamento, desembolsos, pagamentos, estornos, comprovativos e dashboard físico-financeiro.

## Qualidade reproduzível

Execução integral na imagem Docker de validação, usando exclusivamente PostgreSQL e Redis do perfil validation. [Log completo](evidence/m5/quality.txt).

| Verificação | Resultado |
|---|---|
| Unit | 148 aprovados, incluindo 21 M5 |
| Integration | 142 aprovados, incluindo 27 M5 |
| E2E | 11 aprovados, incluindo 2 M5 |
| Lint | Aprovado |
| Typecheck | Aprovado |
| Build de produção | Aprovado |

Inclui isolamento de empresa/obra, RBAC, autoaprovação, cálculos decimais, quantidades acumuladas, imutabilidade API/PostgreSQL, documentos privados, optimistic locking, idempotência concorrente, pagamentos concorrentes, libertações concorrentes, financiamento, estornos e auditoria. Os E2E percorrem gestor → fiscal → financiador → administrador → pagamentos parcial/integral; e acordo → pedido → aprovação independente → desembolso → saldo.

O teste de escala prepara 5.000 medições, 100.000 itens, 50.000 pagamentos e 10.000 desembolsos. As consultas paginadas e agregadas demoraram aproximadamente 73 ms nesta execução local; não representa SLA.

## Banco e Docker

Foram adicionadas migrations 008_financial, 009_financial_integrity e 010_financial_upgrade, totalizando 10 aplicadas. São 19 entidades novas: medições/itens/deduções/pareceres/transições/estornos, movimentos de retenção e adiantamento, libertações, acordos/pedidos/desembolsos, pagamentos/estornos, operações idempotentes, baseline financeira e três ligações documentais. Contratos e documentos existentes são estendidos com FKs compostas e proteção de imutabilidade.

`docker compose config --quiet` e `docker compose up --build -d --wait` executados com sucesso. PostgreSQL, Redis, API, Web e Worker running/healthy: [estado](evidence/m5/docker.json). Health API/PostgreSQL/Redis up: [health](evidence/m5/health.json). [Migrations](evidence/m5/migrations.txt) sem pendências. Não houve deploy em produção.

O seed foi executado no Docker e preserva dados existentes. [Conferência SQL do demo](evidence/m5/demo.txt): MED-001 bruto 1.000.000, retenção 50.000, recuperação 100.000, líquido 850.000, pago 500.000 e PARTIALLY_PAID; financiamento 15.000.000 e desembolso 2.000.000 MZN.

## Interface e documentação

[Certificação](evidence/m5/measurement.png), [financiamento](evidence/m5/funding.png), [dashboard móvel](evidence/m5/financial-mobile.png). Fluxo manual completo e decisões em [financial-workflow.md](financial-workflow.md). Regras específicas em [medições](measurements.md), [retenções](retention.md), [adiantamentos](advance-recovery.md), [financiamento](funding.md) e [pagamentos](payments.md).

## CI

O workflow existente executa install, generate, migrations, lint, typecheck, unit, integration, seed, build e E2E; compose-smoke arranca uma stack nova no runner GitHub e verifica saúde/migrations. A execução do commit entregue deve concluir com os dois jobs verdes antes de declarar M5 pronta para M6. O relatório final inclui o link da execução remota correspondente.
