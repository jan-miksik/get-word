# GDPR Operations Checklist

This checklist tracks compliance work that cannot be fully proven from the app
code alone. It is not legal advice; review it with counsel or a DPO before
claiming production GDPR compliance.

## Processor And Transfer Records

- Confirm the controller/legal entity name and contact details used for Get Word.
- Keep signed data-processing terms or DPAs for Vercel, Supabase, Google Cloud,
  OpenRouter, object storage providers, and any monitoring/support tools.
- Record whether each provider processes data outside the EEA and the transfer
  mechanism used, such as SCCs or another valid safeguard.
- Document which features send user content to each provider:
  - Supabase: account, auth, learning data, lists, progress, usage.
  - Vercel: hosting/runtime request handling.
  - Google Cloud: translation and text-to-speech text.
  - OpenRouter: AI text generation, translation, and Photo Lab image analysis.
  - Object storage/Arweave: generated or shared audio assets.

## Rights Requests

- Respond to access, correction, restriction, objection, deletion, and export
  requests without undue delay and normally within one month.
- Verify the requester's identity before disclosing or deleting personal data.
- Use the in-app export and deletion flows where possible; keep a manual fallback
  for support requests.
- If a request is rejected or limited, record the reason and tell the requester
  how to complain to a data-protection authority.

## Retention And Deletion

- Run `pnpm run account:process-deletions` on a schedule and alert on repeated
  failures in `account_deletion_jobs`.
- Define operational retention windows for logs, backups, rate-limit buckets,
  support messages, and abuse-prevention records.
- Confirm backup deletion/expiry behavior with hosting and database providers.
- Review public/permanent audio storage before enabling features that could put
  user-provided personal data into non-deletable storage.

## Release Checks

- Re-review `/privacy` whenever a new provider, analytics tool, storage backend,
  or AI feature is added.
- Keep Photo Lab copy accurate: photos are sent to the AI provider for analysis
  and local history is stored only in the browser.
- Avoid putting device IDs, user IDs, email addresses, tokens, or API keys into
  URLs or structured logs.
