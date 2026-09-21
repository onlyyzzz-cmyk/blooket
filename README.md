# Templo — Discord Server Template Sharing

Templo is a community hub for **Discord server templates**: discover templates made by others, publish your own in under a minute, and apply any template to your server with one click.

## Features

- **Browse** — search by name, bio, tag, or author; sort by newest, most liked, or most used.
- **Publish** — sign in and add a template with its name, bio, and Discord template link (`https://discord.com/template/…`), plus optional tags and server name.
- **Like** — signed-in users can like templates; the community ranking updates instantly.
- **Use** — every card links directly to Discord's official template page.
- **Manage** — edit or delete your own templates from the dashboard ("My templates" filter).
- **Clerk auth** — the header offers sign-in/sign-up everywhere, with a full-page `/sign-up` fallback.

## Stack

- **Backend:** zero-dependency Node HTTP server (`index.js`) with a JSON API and static file serving. Template data persists to `data/templates.json`.
- **Frontend:** plain HTML/CSS/JS (`public/`) with a Discord-style dark theme.
- **Auth:** Clerk (browser script build), configured via `VITE_CLERK_PUBLISHABLE_KEY`.

## Environment variables

| Key | Purpose |
| --- | --- |
| `PORT` | Port the server listens on (default `8787`). |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_…`) — enables sign-in/sign-up. |
| `DATA_DIR` | Optional override for where `templates.json` is stored. |

## Run

```sh
npm install
npm start          # serves on 0.0.0.0:$PORT (default 8787)
```

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/templates?search=&tag=&sort=new\|top\|copies&mine=1&viewerId=` | List templates |
| POST | `/api/templates` | Publish a template (`ownerId`, `name`, `link`, …) |
| GET | `/api/templates/:id` | Single template |
| PATCH | `/api/templates/:id` | Edit (owner only) |
| DELETE | `/api/templates/:id` | Delete (owner only) |
| POST | `/api/templates/:id` | `action: "like"` or `action: "copy"` |
| GET | `/api/config` | Clerk publishable key for the client |
| GET | `/api/health` | Health check |

Not affiliated with Discord.
