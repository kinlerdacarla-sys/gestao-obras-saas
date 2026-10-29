# Onboarding

`/signup` guia empresa, administrador, plano, trial, preferências e confirmação. Recolhe razão social, nome comercial, NUIT, email, telefone, endereço e identificador de login. Moeda operacional MZN; timezone e formato configuráveis. Plano sem trial exige contacto comercial e não gera checkout.

`POST /api/v1/onboarding` cria numa única transação tenant, organização, utilizador ADMIN convidado, associação, subscrição, settings, preferências de notificação, reset com hash, outbox cifrado e auditorias. Uma falha essencial reverte tudo. Limite de cinco pedidos/IP/hora. As versões legais devem coincidir com a configuração.

O worker `tenant-invitation` lê o outbox de 10 em 10 segundos. A fila contém apenas o ID. Token aleatório, SHA-256 para validação e AES-256-GCM para entrega pendente; ciphertext eliminado após envio/expiração. Convite dura 24 h, uso único, password nunca enviada. O link `/reset-password` ativa/verifica a conta; depois o utilizador entra com identificador da empresa, email e password. SMTP em staging/produção; EML privado em desenvolvimento/teste. Falhas de entrega são reprocessadas. Reinício após envio mas antes do registo pode repetir o email, sem duplicar credenciais.

No dashboard, checklist não bloqueante: empresa, equipa, primeira obra, orçamento e cronograma. O administrador aceita os documentos na própria sessão autenticada em `/legal-acceptances`; não se atribui aceitação a outra pessoa durante provisionamento.
