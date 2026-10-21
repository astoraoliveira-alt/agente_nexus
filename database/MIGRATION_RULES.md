# Migration Rules

- Toda alteração de banco DEVE ser feita via arquivo SQL em /database/migrations
- Nunca alterar banco diretamente sem gerar migration
- Nome padrão: NNN_descricao.sql (sequencial)
- Sempre usar CREATE OR REPLACE para funções
- Nunca editar migrations antigas — sempre criar uma nova
- **Novas Tabelas (Regra Supabase Out/2026)**: Toda criação de tabela (`CREATE TABLE`) deve obrigatoriamente incluir `GRANT` explícito no final da migration para as roles necessárias (`authenticated`, `service_role`, e `anon` se aplicável):
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.nome_tabela TO authenticated;
  GRANT ALL ON public.nome_tabela TO service_role;
  ```

Fluxo:
1. Desenvolver/testar no banco DEV
2. Consolidar versão final em migration
3. Commitar migration
4. Aplicar em produção