# Validação M4 — 7 de outubro de 2026

M1–M3 preservados; M4 acrescenta cadastro comercial, contratos/itens, adendas, retenção/adiantamento, centros de custo, despesas/comprovativos/estorno e dashboard de custos. Nenhuma medição, pagamento ou financiamento foi introduzido.

## Banco e Docker

Migration `202610070007_commercial`: suppliers, contracts, contract_items, contract_amendments, cost_centers, expenses, expense_reversals, expense_documents, contract_documents. Document existente ganha owners opcionais expense/contract, mantendo um único owner e o mesmo storage. FKs compostas, índices e triggers de integridade. Sete migrations aplicadas desde zero no PostgreSQL de testes Docker; seed idempotente executado. Compose config e `up --build -d --wait` aprovados, cinco serviços healthy e health API/PostgreSQL/Redis up.

## Qualidade

Passagem integral isolada Linux: [log](evidence/m4/quality.txt).

```text
Unit:        127 aprovados (35 M4)
Integration: 115 aprovados (28 M4)
E2E:           9 aprovados (2 M4, com aprovação e estorno)
Lint:        aprovado
Typecheck:   aprovado
Build:       aprovado
```

Inclui alterações parciais sem reinjetar defaults, valores decimais, sobrecontratação, ausência de dupla contagem, isolamento de IDs/rotas/associações, RBAC, autoaprovação recusada, documentos privados, concorrência, aprovações simultâneas, auditoria, imutabilidade API/SQL e Swagger. Os E2E percorrem fornecedor → contrato → item orçamental → ativação → adenda → aprovação por outro ADMIN; e MANAGER → centro → despesa → comprovativo → submissão → ADMIN aprova → estorno com motivo → custo removido e histórico preservado.

O resumo contratual também apresenta adições e supressões separadas, obtidas por agregação backend (independente da paginação). Essa última apresentação é verificada adicionalmente em lint, tipos, integração M4, build e E2E M4; o CI executa novamente toda a suite no commit entregue.

## Performance

Teste real PostgreSQL: 1.000 contratos, 10.000 itens e 20.000 despesas. Consultas principais paginadas e agregações concluíram em aproximadamente 89 ms combinados na passagem integral; preparação e consultas em 6,9 s. Medição local, não um SLA. Não há carregamento integral dessas tabelas no frontend.

## Revisão visual

[Contrato](evidence/m4/contract.png) e [despesa móvel](evidence/m4/expense-mobile.png). Interface reutiliza estilos e componentes existentes; upload e cálculos percorridos no Chromium.

## CI

O workflow `.github/workflows/ci.yml` mantém install, generate, migrations, lint, typecheck, unit, integration, seed, build e E2E; job separado executa Compose clean-room. A execução remota do commit M4 deve estar verde antes da declaração final de conclusão. O link e o estado da execução são registados no relatório de entrega.

## Como testar

1. Entre em Edifício Demo como `admin@example.com`. O seed apresenta SUB-001 com original 5.000.000 MZN e atual 5.500.000 MZN.
2. Abra Fornecedores e crie um subempreiteiro. Abra Contratos, crie DRAFT com original, retenção e adiantamento. Adicione itens, opcionalmente ligados a rubricas, cuja soma iguale o original; ative.
3. Crie adenda ADDITION ou OMISSION, submeta e tente aprová-la com o criador: deve ser recusada. Entre como `diretor@example.com` para aprovação independente. Verifique o novo valor contratual.
4. Como `gestor@example.com`, crie centro hierárquico e despesa, com subtotal/imposto; anexe PDF/imagem e submeta. ADMIN aprova.
5. Confira Custos: despesas sem contrato reduzem o saldo; despesas contratuais não duplicam o compromisso. Estorne a despesa com motivo e confirme indicadores e histórico.
6. FINANCIER consulta contratos, adendas aprovadas e agregados sem editar. CLIENT e INSPECTOR não acedem a comprovativos de despesas.

Contas demo usam a senha configurada em DEMO_PASSWORD. `PREVENT_SELF_APPROVAL=true` aplica-se inclusive ao ADMIN. Não houve deploy em produção.
