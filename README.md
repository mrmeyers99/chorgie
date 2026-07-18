# Chorgie

## Data model

Reflects the current schema in `api/migrations/*.js` (see `CLAUDE.md` for the instruction to keep this in sync).

```mermaid
erDiagram
    HOUSEHOLDS ||--o{ USERS : has
    HOUSEHOLDS ||--o{ KID_PROFILES : has
    HOUSEHOLDS ||--o{ CHORE_DEFINITIONS : has
    HOUSEHOLDS ||--o{ CHORE_COMPLETIONS : has
    HOUSEHOLDS ||--o{ PAYOUTS : has
    KID_PROFILES ||--o{ CHORE_COMPLETIONS : completes
    KID_PROFILES ||--o{ PAYOUTS : receives
    CHORE_DEFINITIONS ||--o{ CHORE_COMPLETIONS : logs
    CHORE_DEFINITIONS }o--o{ KID_PROFILES : "eligible via CHORE_ELIGIBLE_KIDS"
    PAYOUTS ||--o{ CHORE_COMPLETIONS : settles

    HOUSEHOLDS {
        uuid id PK
        text timezone
        varchar currency_code
        text enc_salt
        timestamptz created_at
    }

    USERS {
        uuid id PK
        uuid household_id FK
        text email UK
        text password_hash
        text admin_pin_hash
        timestamptz created_at
    }

    KID_PROFILES {
        uuid id PK
        uuid household_id FK
        text enc_display_name
        text avatar_id
        integer sort_order
        boolean is_active
        numeric balance
        timestamptz created_at
    }

    CHORE_DEFINITIONS {
        uuid id PK
        uuid household_id FK
        text enc_name
        text enc_description
        numeric reward_amount
        text recurrence_type "ad-hoc | recurring | always-available"
        text enc_recurrence_rule
        boolean is_active
        timestamptz last_completed_at
        timestamptz next_available_at
        timestamptz created_at
    }

    CHORE_ELIGIBLE_KIDS {
        uuid chore_id PK,FK
        uuid kid_id PK,FK
    }

    CHORE_COMPLETIONS {
        uuid id PK
        uuid household_id FK
        uuid chore_id FK
        uuid kid_id FK
        uuid payout_id FK
        numeric reward_amount
        timestamptz completed_at
        timestamptz paid_at
    }

    PAYOUTS {
        uuid id PK
        uuid household_id FK
        uuid kid_id FK
        text enc_notes
        timestamptz paid_at
        timestamptz created_at
    }
```

## Local Docker development

Create a local `.env` file with local-only credentials before starting the stack:

```bash
{
  echo "POSTGRES_USER=chorgie"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
  echo "JWT_SECRET=$(openssl rand -hex 32)"
} > .env
```

Run the full local stack with Docker Compose:

```bash
docker compose up --build
```

Services:

- Web UI: http://localhost:5173
- API: http://localhost:3000
- Postgres: localhost:5432

Notes:

- The API container runs database migrations on startup.
- The web app is configured to talk to the local API at `http://localhost:3000`.
- Stop the stack with `docker compose down`.
- Reset the local database with `docker compose down -v`.
