# Fluxo financeiro M5

## Cálculos

GrossAmount = soma de CurrentAmount. RetentionAmount = bruto × retenção contratual. NetCertifiedAmount = bruto − retenção − recuperação de adiantamento − outras deduções. Penalizações e outras deduções têm descrição e montante próprios. Líquido negativo é rejeitado.

GET /financial/summary agrega no PostgreSQL dentro de snapshot RepeatableRead. Inclui orçamento aprovado M2, contratos atuais M4, bruto de medições válidas, certificado, retenção, adiantamento, líquido certificado, pagamentos de medições, saldo a pagar, acordos e desembolsos. FinancialProgress = certificado bruto / valor contratual atual × 100; MeasurementProgress = bruto medido / valor contratual atual × 100. Denominador zero devolve zero.

Progresso físico vem do último ProjectProgressSnapshot M3. PhysicalFinancialVariance = físico − financeiro em pontos percentuais; é descritivo, sem classificar automaticamente como problema.

## Curva S

GET /financial/curve reutiliza snapshots M3 e agrega eventos de certificação/estorno por data. A baseline financeira congela a soma dos contratos reconhecidos na primeira certificação; adendas posteriores não reescrevem a curva histórica. actual_financial = bruto certificado acumulado líquido de estornos / baseline × 100. planned_financial é proporcional a planned_physical; não é uma previsão contratual de tesouraria. Nos dias sem snapshot, conserva-se o último progresso físico conhecido. As quatro séries estão identificadas na UI e na tabela acessível.

## Segurança e concorrência

As mutações financeiras usam uma transação PostgreSQL e bloqueio da linha da obra, serializando decisões de saldo dentro de cada obra. Isto favorece correção e simplicidade do monólito; obras diferentes continuam independentes. FKs compostas ligam tenant/obra/entidade e impedem referências cruzadas. Endpoints verificam participação e perfil antes de consultar resultados idempotentes. Valores certificados, pagamentos, desembolsos e históricos têm proteção adicional no banco.

Optimistic locking exige version em medições, acordos, pedidos, pagamentos e libertações. Conflitos devolvem 409 RESOURCE_VERSION_CONFLICT. Certificação, pagamentos, desembolsos e estornos exigem Idempotency-Key. Auditoria é gravada na mesma transação. Não há hard delete de lançamentos financeiros.

DocumentModule é partilhado com M3/M4; a M5 acrescenta ligações para medições, acordos e pagamentos, sem duplicar armazenamento ou upload. Listas usam paginação até 200; resumos usam aggregates/groupBy, com índices tenant/obra/estado/origem. O teste de escala prepara 5.000 medições, 100.000 itens, 50.000 pagamentos e 10.000 desembolsos e valida consultas paginadas/agregadas.

## Teste manual

1. `docker compose up --build -d --wait`; API aplica migrations e seed no arranque. Verifique `docker compose ps` e GET localhost:3001/health. Nenhum PostgreSQL/Redis local é necessário.
2. Entre com empresa construtora-demo e o password DEMO_PASSWORD de .env.example. Perfis: gestor, fiscal, financiador e admin @example.com.
3. Como gestor, abra Edifício Demo → Medições → Nova medição → SUB-001. Escolha período, adicione 0,1 do item de 5 milhões. Bruto 500.000, retenção 25.000, recuperação 50.000, líquido 425.000. Submeta.
4. Como fiscal, aprove revisão fiscal. Como financiador, aprove medição. Como admin, certifique. Verifique movimentos no contrato → Retenções e adiantamentos.
5. Como admin, em Pagamentos selecione a medição, lance 100.000 e depois 325.000. Confira PARTIALLY_PAID e PAID. Estorne um pagamento com motivo e confira recomposição do saldo.
6. Como admin, crie acordo ACTIVE. Como gestor, crie/submeta pedido. Como financiador, aprove e registe desembolso. Confira o saldo do acordo e ausência de pagamento fictício ao fornecedor.
7. Abra Dashboard financeiro e os históricos. Anexe comprovativo ao pagamento e verifique acesso com outro perfil permitido; fiscal não tem acesso a pagamentos.

Seed idempotente: SUB-001 / MED-001 bruto 1.000.000, retenção 50.000, recuperação 100.000, líquido 850.000, pago 500.000, PARTIALLY_PAID; acordo 15.000.000 e desembolso 2.000.000. Se já houver medições no contrato demo, o seed preserva-as.

## Validação reproduzível e CI

`docker compose --profile validation build tests` seguido de `docker compose --profile validation run --rm tests` executa migrations, lint, typecheck, unitários, integração, seed, build e E2E. PostgreSQL/Redis de testes são serviços dedicados. O teste E2E M5 limpa apenas as chaves de rate limit no Redis de testes antes dos seus fluxos multiutilizador; a proteção da aplicação não é relaxada. GitHub Actions executa os mesmos estágios e um segundo job faz smoke test Compose. Não há deploy.
