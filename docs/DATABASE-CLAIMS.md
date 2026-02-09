# Database-driven JWT claims

When `DATABASE_URL` is set, the Central Auth service loads JWT `aud` and `apps` (and optional identity fields) from PostgreSQL instead of using mock data.

## Configuration

Set in `.env` (or on the VM):

```env
DATABASE_URL=postgresql://user:password@host:5432/database_name
```

If `DATABASE_URL` is not set, the app runs without DB and uses default/mock claims (same as before).

## Query and mapping

The app runs a single parameterized query by user email:

```sql
SELECT p.person_id, p.primary_email, p.display_name, p.user_status, pa.app_slug, ap.app_name, pa.persona_code, per.persona_name
FROM subject.person p
INNER JOIN subject.persona_assignment pa ON p.person_id = pa.person_id
JOIN subject.personas per ON pa.persona_code = per.persona_id
JOIN subject.apps ap ON pa.app_slug = ap.app_id
WHERE p.primary_email = $1
```

- **JWT `aud`:** Distinct values of `pa.app_slug` from the result rows.
- **JWT `apps`:** One entry per distinct `ap.app_name` (keys = app names; logged as appSlugs):
  - Key: `ap.app_name`
  - Value: `{ uid: persona_code (first per app), roles: [ persona_name, ... ] }`
- **Identity:** From the first row: `sub` and `identity.Person_uuid` from `p.person_id`, `status` from `user_status`.

## Behavior

- **DB configured and query returns rows:** JWT is built from DB (aud, apps, personId, status, personUuid).
- **DB not configured, no rows, or query error:** Falls back to default/mock claims; login still succeeds. Errors are logged.

## VM deployment

On the VM, add `DATABASE_URL` to `.env`, then restart the app (e.g. `pm2 restart central-auth`). Ensure the VM can reach PostgreSQL (firewall/security group for port 5432 if the DB is remote).
