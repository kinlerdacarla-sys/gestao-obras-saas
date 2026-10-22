# Notificações

M7 reutiliza a tabela de notificações existente. `/notifications` disponibiliza caixa de entrada, contador de não lidas, marcação individual/em lote e preferências por categoria e canal. Consultas revalidam a participação atual na obra.

Email é assíncrono: a fila `email-notification` verifica preferências, configuração do tenant e acesso atual antes da entrega. O conteúdo apenas avisa da existência de uma notificação e liga à aplicação autenticada; não inclui fotografias, valores ou documentos privados. Há retries com backoff e registo `emailedAt` para evitar nova entrega após sucesso.

Por defeito `MAIL_TRANSPORT=stream` grava `.eml` em `work/mail-outbox` no worker, sem enviar email externo. Para entrega real, configurar `MAIL_TRANSPORT=smtp`, `SMTP_URL` e `MAIL_FROM` no ambiente privado, ativar email no tenant e nas preferências. Nunca guardar credenciais no Git. A validação automatizada usa stream; não comprova entrega por um fornecedor externo.

`daily-digest` corre às 07:00 Africa/Maputo para utilizadores que optaram pelo resumo. Agrega alertas autorizados e liga à lista de ações. O monitor existente de qualidade continua ativo. Convites/recuperação M1 mantêm o adaptador próprio e não são alterados por esta configuração.
