-- FIX AUTH LINKING RLS
-- Problem: When a user logs in to a NEW environment, their auth.uid() changes.
-- The AppContext tries to find them by 'provider_id' (old UID), fails, then tries by 'email'.
-- But RLS prevents reading ANY user record if ID doesn't match.

-- Solution: Allow users to read their own record if the EMAIL matches their session email.

DROP POLICY IF EXISTS "Allow read by email" ON users;

CREATE POLICY "Allow read by email" ON users
FOR SELECT
USING (
    email = auth.jwt() ->> 'email'
);

-- Note: This is safe because it only allows reading the record that EXACTLY matches the authenticated user's email.
