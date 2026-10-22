# Ações corretivas

Ações são numeradas dentro da NCR e têm responsável, organização, prazo, descrição, versão e notas de conclusão.

OPEN → IN_PROGRESS → COMPLETED → VERIFIED. Uma ação COMPLETED pode ser REJECTED pelo fiscal e voltar a IN_PROGRESS; ações não verificadas podem ser CANCELLED. VERIFIED é imutável no banco.

Criar ou executar ações requer NCR em CORRECTION_IN_PROGRESS. Completar requer notas e pelo menos uma evidência confirmada. MANAGER/ADMIN usa o DocumentModule existente para anexar fotografia/documento. A evidência pertence à ação, não à inspeção original.

A NCR só fica pronta quando todas as ações não canceladas estão COMPLETED/VERIFIED e há correção nova concluída. INSPECTOR/ADMIN verifica cada ação ou o conjunto pelo endpoint de verificação da NCR. Encerrar requer todas VERIFIED e verificação da NCR. Rejeitar reabre a NCR e conserva o histórico.

`prevent_self_verification=true` é obrigatório. `completed_by` não pode coincidir com o verificador; retorna SELF_VERIFICATION_NOT_ALLOWED. A verificação também exige perfil autorizado, mesmo quando o utilizador não é executor.

Todos os endpoints de mutação exigem version. Transações serializadas por obra protegem verificações concorrentes e os saldos/decisões de certificação relacionados.
