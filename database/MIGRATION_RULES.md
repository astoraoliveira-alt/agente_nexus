# Migration Rules

- Toda alteração de banco DEVE ser feita via arquivo SQL em /database/migrations
- Nunca alterar banco diretamente sem gerar migration
- Nome padrão: NNN_descricao.sql (sequencial)
- Sempre usar CREATE OR REPLACE para funções
- Nunca editar migrations antigas — sempre criar uma nova

Fluxo:
1. Desenvolver/testar no banco DEV
2. Consolidar versão final em migration
3. Commitar migration
4. Aplicar em produção