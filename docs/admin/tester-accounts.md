# Tester accounts

The admin dashboard reports on one population at a time (`?testers=hide|only|all`).
"Tester" means a store-review or QA account from a closed-testing programme: it
registers, opens the app once, and never studies, so a wave of them buries the
real numbers.

Those addresses are real personal data. They are rows in the `tester_accounts`
table and must never be committed — they were a checked-in list in
`lib/db/queries/tester-accounts.ts` until migration `0079_tester_accounts.sql`,
and that history is the reason the list was purged from the repository.

## Adding a wave

Testers arrive as a list of email addresses from the programme. Add them with
SQL, against dev first and then production:

```sql
INSERT INTO tester_accounts (email, note) VALUES
  ('someone@example.com', 'play closed testing 2026-10')
ON CONFLICT (email) DO NOTHING;
```

Addresses must be lowercase — a check constraint enforces it, and the stats
queries compare against `lower(users.email)`.

Run it through the production helper, which asks for the connection string with
hidden input so it stays out of the shell history and out of any transcript:

```bash
pnpm run db:prod -- sql path/to/tester-accounts.sql
```

Keep that file outside the repository — it holds the addresses.

## Removing one

A tester who became a real user should stop being filtered out:

```sql
DELETE FROM tester_accounts WHERE email = 'someone@example.com';
```

## Checking

The dashboard's tester toggle shows how many accounts are known
(`stats.testers.knownAccounts`) without ever sending the addresses to the
browser. `only` is how you confirm a wave arrived.
