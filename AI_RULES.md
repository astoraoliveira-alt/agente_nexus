# AI Development Rules

## Database Changes

- All database changes MUST be done via SQL migration files
- Location: /database/migrations
- Naming: NNN_description.sql (sequential)
- NEVER modify the database directly without generating a migration
- ALWAYS use CREATE OR REPLACE for functions
- NEVER edit old migrations

When asked to change database logic:
→ Generate a migration file automatically
→ Do not execute SQL directly