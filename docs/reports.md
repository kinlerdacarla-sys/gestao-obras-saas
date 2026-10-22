# Relatórios privados PDF e XLSX

Nove tipos em ambos os formatos: executivo de obra, progresso, financeiro, medições, contratos, qualidade, diário de obra, financiamento e portfólio. O portfólio é exclusivo ADMIN. ADMIN/MANAGER têm relatórios da obra; INSPECTOR tem progresso, medições, qualidade e diário; FINANCIER tem executivo, progresso, financeiro, medições, qualidade e financiamento; CLIENT tem executivo, progresso e qualidade.

Em `/reports`, escolher obra, tipo, período e formato. O pedido cria um ReportJob e enfileira `report-generation`; o worker gera o ficheiro e a interface acompanha o estado. PDF inclui identificação, secções, curva quando aplicável e imagens autorizadas. XLSX tem folhas por secção, cabeçalhos, filtros e valores monetários exatos como texto. Texto introduzido pelo utilizador não se transforma em fórmula.

O backend verifica autorização no pedido, novamente no worker e no download. Apenas o requerente pode descarregar. A ligação assinada dura 60 segundos e continua a exigir sessão válida; o relatório expira após sete dias. Não existem URLs públicas permanentes. Mudanças de perfil ou de política documental invalidam o acesso ao ficheiro antigo e exigem regeneração. O armazenamento privado é partilhado entre API e worker.

Dados INTERNAL nunca entram no relatório de CLIENT/FINANCIER. Cada secção usa campos explicitamente selecionados. Galeria filtra a visibilidade e estado de aprovação antes de carregar imagens. Limite de 20 mil linhas por secção: pedidos maiores falham com indicação para reduzir o período. São incluídas até oito fotografias recentes autorizadas.

Pedidos, geração, falhas e downloads são auditados. Falhas da fila aparecem no estado do relatório; nenhum erro é apresentado como exportação concluída.
