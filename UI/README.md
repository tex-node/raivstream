# Raivstream UI Prototype

This folder contains the rebuilt UI prototype for Raivstream's main app, R16 Kids mode, creator tools, admin console, credit workflows, and reusable blank templates for future features.

## Backup

The original UI export was backed up before the rebuild:

```text
C:\Raiv\raivstream\UI_backup_20260610-213131
```

Restore from that folder if the original generated UI is needed again.

## Running The Preview

```bash
pnpm install
pnpm dev --host 127.0.0.1 --port 5173
```

Then open:

```text
http://127.0.0.1:5173
```

## Current Prototype

The active prototype entry is:

```text
src/app/App.tsx
```

It includes:

- Main vertical feed
- R16 Kids feed
- AI Studio
- Story Studio
- Media library
- Creator analytics
- Credits and ledger
- Admin console
- Blank page templates for future modules
