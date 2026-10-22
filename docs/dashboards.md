# Dashboards por perfil

- ADMIN: portfólio do tenant, totais, estados executivos, filtros e comparação de 2–10 obras.
- MANAGER: obras atribuídas, atrasos, medições, diários, despesas e trabalho pendente.
- INSPECTOR: progresso, inspeções, pedidos e NCR; valores financeiros são removidos pelo backend.
- FINANCIER: obras atribuídas, execução, certificação, pagamentos, financiamento e desembolsos.
- CLIENT: visão simplificada das obras atribuídas, progresso, qualidade, fotografias autorizadas e relatórios permitidos.

O perfil efetivo na obra é verificado em cada consulta. Abrir uma obra mostra indicadores, curva S e ligações aos módulos de origem. Os filtros de tarefas atrasadas e NCR críticas abrem listas filtradas, não novos registos.

## Teste manual

Entrar com uma conta demo do perfil pretendido. ADMIN: Dashboard → filtrar obras → comparar → abrir a obra Estrada Municipal → NCR críticas → Alertas → gerar relatório. MANAGER: Dashboard → trabalho pendente → obra → cronograma/diário/medições. INSPECTOR: abrir Qualidade → inspeções/NCR → relatório de qualidade e confirmar ausência de valores financeiros. FINANCIER e CLIENT: seguir os guias dos respetivos portais.

O seed acrescenta Centro de Saúde (cenário saudável) e Estrada Municipal (atraso/NCR crítica) à obra demo existente. As contas externas não são atribuídas à estrada. Dados e imagens são demonstrativos.
