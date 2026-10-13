# Recuperação de adiantamentos

O valor concedido vem de advanceAmount do contrato M4. A M5 regista uma única ADVANCE_GRANTED por contrato ao ativar o contrato, configurar condições financeiras de um contrato ativo ou criar a primeira medição. A migration de atualização inicializa os contratos ativos anteriores. Este lançamento reconhece o adiantamento contratual; não representa integração bancária nem cria um pagamento fictício.

Métodos: PERCENTAGE (bruto × percentagem), FIXED (valor fixo por medição) e MANUAL (manualAdvanceRecovery da medição). Métodos automáticos são limitados ao saldo disponível; manual acima do saldo devolve ADVANCE_RECOVERY_EXCEEDS_OUTSTANDING. Condições iniciais são MANUAL e valor zero, evitando inventar uma percentagem em contratos existentes.

Saldo = ADVANCE_GRANTED − ADVANCE_RECOVERED + ADVANCE_REVERSED. Recuperação só é lançada ao certificar. Medições anteriores APPROVED reservam a recuperação prevista; certificam-se por ordem. O campo M4 advanceRecoveredAmount é atualizado na mesma transação como projeção do ledger.

Exemplo: saldo 700.000, bruto 1.000.000 e taxa 10% → recuperação 100.000 e saldo 600.000. Estorno repõe saldo por movimento compensatório; não elimina o movimento original.

ADMIN configura método, percentagem/valor fixo e perfil de aprovação final em PATCH /api/v1/projects/:projectId/contracts/:id/financial-settings com version. Alterações são bloqueadas enquanto existirem medições em revisão ou válidas. O seed SUB-001 usa 10% e recuperação de 100.000 na MED-001.
