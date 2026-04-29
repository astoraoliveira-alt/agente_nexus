# AI Development Rules

## Database Changes

- All database changes MUST be done via SQL migration files
- Location: /database/migrations
- Naming: NNN_description.sql (sequential)
- NEVER modify the database directly without generating a migration
- ALWAYS use CREATE OR REPLACE for functions
- NEVER edit old migrations
- Nunca simplifique funções, sempre leve em consideração a ultima versão do código e faça os ajustes baseado nesse código. Assim evitamos perder estruturas que já estão funcionando.
- Sempre que for necessário criar, alterar, excluir uma tabela, funcao ou trigger em banco de dados atualize o arquivo schema.sql ele deve sempre ser usado como referência para procurar a ultima versão desses objetos no banco de dados. Ele é a nossa fonte da verdade.


When asked to change database logic:
→ Generate a migration file automatically
→ Do not execute SQL directly