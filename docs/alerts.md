# Alertas operacionais

Regras: atraso de cronograma, orçamento excedido, contrato acima do orçamento, saldo de financiamento baixo, pagamento pendente, medição aguardando aprovação, NCR vencida, NCR crítica, contrato próximo do fim, inspeção pendente e ausência de diário aprovado.

O M5 não tem vencimento contratual de pagamento: o aviso usa certificação com mais de 30 dias e saldo líquido por pagar. É uma regra operacional, não uma declaração de incumprimento. Contratos próximos do fim e ausência de diário usam os dias configurados; apenas obras ativas geram avisos de diário.

A avaliação ocorre no snapshot diário ou por pedido de ADMIN/MANAGER. O lock da obra serializa avaliações. Uma chave por tenant/obra/tipo/entidade e índice parcial impedem duplicados ativos, reconhecidos ou dispensados. Quando a condição desaparece, o alerta é resolvido automaticamente. Uma ocorrência posterior pode criar novo alerta.

Estados: ACTIVE, ACKNOWLEDGED, DISMISSED e RESOLVED. Alterações usam versão para optimistic locking e auditoria. CLIENT/FINANCIER consultam apenas alertas permitidos; o fiscal não recebe dados financeiros. ADMIN configura limiares e canais em `/settings/alerts`.
