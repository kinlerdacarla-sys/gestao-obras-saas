# Analytics M7

Os indicadores são calculados no backend sobre M1–M6. Não existe um segundo ledger financeiro. Valores MZN usam Decimal e são serializados como strings; denominador zero produz `null`, nunca um rácio enganador.

## Fórmulas e fontes

- Execução financeira: certificado / contratos atuais × 100.
- Taxa de pagamento: pago / certificado × 100.
- Desembolso: desembolsado / financiamento aprovado × 100.
- Contratação: contratos atuais / orçamento aprovado × 100.
- Previsão de custo conhecida: contratos atuais + despesas diretas aprovadas sem contrato. Não duplica despesas de contrato. Não representa uma estimativa probabilística de custos futuros desconhecidos.
- Desvio de custo: orçamento aprovado − previsão conhecida.
- Progresso físico, variância, tarefas atrasadas e em risco reutilizam o cálculo M3 e os seus pesos. A variância é real − planeado, em pontos percentuais.
- NCR, inspeções e tendências reutilizam M6; canceladas/encerradas não contam como NCR ativas.

A previsão de conclusão exige pelo menos sete dias, 5% de execução e duas observações. Usa a velocidade média observada, apresenta confiança e devolve ausência de previsão quando faltam dados. Não substitui um replaneamento contratual.

## Estados e curva S

NCR crítica ativa implica CRITICAL. Excesso de custo ou atraso superior ao dobro do limiar implica AT_RISK; restantes sinais de atenção implicam ATTENTION. Sem sinais, ON_TRACK. Sem cronograma/orçamento, a avaliação é explicitamente parcial. Os limiares são configuráveis em Definições de alertas.

As quatro séries são: físico planeado (baseline M3), físico real (histórico M3), financeiro planeado (distribuição proporcional da baseline usada pelo M5, aproximação identificada na interface) e financeiro real (certificações líquidas de estornos M5). Valores financeiros sem baseline são nulos. Filtros de datas e agrupamento DAY/WEEK/MONTH mantêm o último ponto do período.

## API e desempenho

`GET /api/v1/dashboard/portfolio`, `/dashboard/worklist`, `/projects/:id/analytics`, `/projects/:id/analytics/s-curve`, `/analytics/projects/compare?projects=id,id`. Comparação aceita 2–10 obras autorizadas. Os filtros de datas do portfólio referem-se à data de início da obra; os da curva referem-se aos pontos históricos.

Cache Redis: 30 segundos no portfólio, 60 na obra. Chaves incluem tenant, utilizador, perfis efetivos e filtros; a autorização atual é verificada antes de servir cache. Snapshots diários às 23:15 Africa/Maputo usam a fila `project-kpi-snapshot`. ADMIN pode regenerar o dia atual; não se inventa histórico retroativo. Snapshots fiscais omitem finanças.
