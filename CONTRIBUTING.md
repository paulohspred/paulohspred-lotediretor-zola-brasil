# Contributing to LoteDiretor Brasil

## Workflow

- `main` is the deployable integration branch.
- Create a short-lived feature/fix branch from the latest `main`.
- Keep commits focused and do not force-push `main`.
- Open a pull request for changes that affect production behavior, data contracts, infrastructure or migrations.
- Required checks must be green before merge.

## Local checks

Frontend:

```bash
yarn install --frozen-lockfile --ignore-engines
yarn lint
yarn test
yarn build
scripts/web-production-smoke.sh
```

Platform v2:

```bash
sudo ./platform-v2/scripts/foundation-smoke.sh
sudo ./platform-v2/scripts/platform-api-smoke.sh
sudo ./platform-v2/scripts/materialization-api-smoke.sh
```

Changes to API contracts must also regenerate the versioned OpenAPI/GraphQL artifacts and leave no unexpected diff.

## Data and evidence rules

Derived technical conclusions must preserve source snapshot, citation and provenance. Do not turn geometric overlap or MDT-derived screening into a legal, surveying or engineering approval conclusion.

Never commit credentials or a populated `platform-v2/.env`.

## Production changes

Use the versioned deployment scripts and systemd services. Do not run a second web process with `nohup`, `zola.pid` or ad-hoc port ownership.

Create a verified backup before migrations, credential rotation or destructive maintenance.
