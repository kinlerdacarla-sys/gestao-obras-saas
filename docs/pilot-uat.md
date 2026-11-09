# Aceitação do piloto
Usar tenant exclusivo, organização real apenas com autorização, plano/entitlements explicitamente aprovados, flags experimentais desligadas. Convidar administrador, verificar caixa, senha e email, quota/storage e acesso a uma primeira obra; depois equipa, orçamento, cronograma e diário. Não introduzir pagamentos reais para testar. Usar SUPPORT_EMAIL configurado. Testes destrutivos/financeiros apenas em staging com dados sintéticos.

Estados: PASS, FAIL, BLOCKED, NOT TESTED. Registar tester, data, ambiente, SHA, evidência e notas por cenário. Um teste automatizado local não é aceitação do cliente.

| Cenário | Resultado esperado | Estado | Tester/data/evidência/notas |
|---|---|---|---|
| 1 | Login com convite válido e token não reutilizável | NOT TESTED | — |
| 2 | Criar obra e validar acesso por tenant | NOT TESTED | — |
| 3 | Importar XLSX e confirmar preview e totais | NOT TESTED | — |
| 4 | Cronograma hierárquico com baseline | NOT TESTED | — |
| 5 | Diário com foto e visibilidade | NOT TESTED | — |
| 6 | Contrato com fornecedor e aditamento | NOT TESTED | — |
| 7 | Despesa e aprovação | NOT TESTED | — |
| 8 | Medição com líquido correto | NOT TESTED | — |
| 9 | Fiscalização e revisão independente | NOT TESTED | — |
| 10 | Certificar após revisão | NOT TESTED | — |
| 11 | Pagamento não excede saldo | NOT TESTED | — |
| 12 | Inspeção e evidência | NOT TESTED | — |
| 13 | NCR e ação corretiva | NOT TESTED | — |
| 14 | Relatório com download autenticado | NOT TESTED | — |
| 15 | Portal cliente não mostra dados internos | NOT TESTED | — |
| 16 | Portal financiador só mostra obra autorizada | NOT TESTED | — |

Matriz mínima de aceite: Chrome e Edge atuais (Chromium), Firefox e Safari atuais, Chrome Android e Safari iPhone. Nos viewports móveis testar login, diário, foto, inspeção, NCR e dashboard; testar também upload nativo em dispositivo real. O E2E histórico Chromium não comprova os restantes browsers. Assinatura final do cliente e do operador pendente.
