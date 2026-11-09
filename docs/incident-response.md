# Resposta a incidentes
SEV-1: indisponibilidade global, suspeita de exposição entre tenants, violação de segurança ou corrupção financeira. SEV-2: degradação importante com alternativa parcial (ex.: email, exportação, worker). SEV-3: impacto limitado sem perda de dados ou segurança.

1. **Detetar e classificar:** registar UTC, release, componente, IDs técnicos, impacto e responsável. Nunca copiar credenciais nem documentos privados.
2. **Conter:** SEV-1 exige resposta imediata: desativar caminho afetado, restringir acesso, congelar escritas, preservar snapshots e logs. Não apagar evidências. Manutenção: Super Admin autenticado recentemente pode POST /api/v1/platform/maintenance com enabled, versão atual, motivo e duração de 1–240 minutos. Health e recuperação administrativa permanecem disponíveis; isto não suspende workers, que devem ser contidos separadamente se necessário.
3. **Comunicar:** usar contactos de operação e suporte configurados; comunicar factos, alcance conhecido e hora da próxima atualização. Não publicar estado 'operacional' sem monitorização. Página pública futura deve distinguir Web, API, email e storage.
4. **Recuperar:** aplicar rollback ou restore isolado; em exposição cross-tenant preservar evidências, delimitar acessos e rotacionar credenciais afetadas. Envolver responsável por dados para comunicações obrigatórias.
5. **Verificar:** testes negativos de isolamento, integridade, readiness, filas e smoke. Registar quem aceitou o risco residual. Fazer postmortem com cronologia, causa, ações, responsáveis e prazos.
