# Quotas e utilização

ProjectService valida criação e reativação de obra terminada/cancelada. PLANNING, ACTIVE e SUSPENDED contam. UserService valida convites; ACTIVE e INVITED consomem lugar. Ativar convite não duplica consumo; não existe endpoint para ativar arbitrariamente uma associação desativada.

DocumentService reserva bytes no pedido e revalida na confirmação sob lock do tenant. Documentos confirmados e reservas ainda válidas contam na capacidade disponível; reservas expiradas não contam. Não se soma duas vezes o mesmo upload na confirmação. Artefactos de relatório também contam. BigInt preserva bytes sem perda de precisão. A interface distingue uso de documentos confirmados e capacidade reservada.

ReportService aceita `requestKey` UUID por tenant/utilizador. Repetir o mesmo pedido devolve o mesmo job; trocar parâmetros rejeita IDEMPOTENCY_CONFLICT. Pedidos aceites contam no mês UTC de criação, inclusive se falharem posteriormente. Falha na fila antes da aceitação não conta; nova tentativa revalida quota. Retries do worker não incrementam consumo.

Todas as alocações partilham SELECT FOR UPDATE no tenant com alterações de plano. Snapshots são idempotentes. `storage-usage-reconciliation` corre de hora em hora, remove reservas abandonadas, artefactos expirados e atualiza uso. UI apresenta avisos a 80%, 90% e 100%, sem mensagens repetidas externas.

Exportações de portabilidade têm limite separado de três pedidos/dia e 256 MiB descomprimidos por artefacto, disponíveis 24 h. Não bloqueiam uma empresa já acima da sua quota de documentos. Limite por tabela: 100 mil linhas; exceder falha explicitamente, nunca entrega um recorte silencioso.
