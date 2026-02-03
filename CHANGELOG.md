# Changelog

## [Unreleased] - 2026-02-03

### Added
- **Real-time Agent Statistics**: Updated `api.getAgents` to calculate `activeConversations` and `totalConversations` directly from the `conversations` table in Supabase, replacing static mock values.
- **Real-time User Counts**: Updated `Profiles` page to fetch and count real users by role (`tenant_admin`, `operator`) from the API.
- **Supabase Integration**: Fully integrated `Users` page with Supabase API (`api.getUsers`), removing dependency on `MOCK_USERS`.

### Changed
- **Authentication**: Refactored authentication to verify users against the database via `api.getUserByEmail` instead of a hardcoded list.
- **UI Improvements**:
  - Removed technical UUIDs from **Agent Cards** for a cleaner look.
  - Removed technical UUIDs (User ID, Agent ID, Conversation ID) from the **Conversation Details Panel**.
  - Updated **Conversation Details Panel** to use real data types, removing `mock-data` dependencies.
- **Bug Fixes**:
  - Fixed "Invalid time value" error in Chat and Flows by correctly mapping Supabase `created_at` timestamps to JavaScript Date objects.
  - Fixed potential crash in Flows page due to undefined `linked_agents`.
  - Fixed `User` type conflicts between `types.ts` and `mock-data.ts`.

### Removed
- **Mock Data**: Removed usages of `MOCK_USERS`, `mockAgents`, and hardcoded `MOCK_PROFILES` counts in favor of live API data.
