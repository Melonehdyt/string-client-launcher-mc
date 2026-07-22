# String Client API

Base URL: `https://stringclient.com`

## Overview

The API follows a similar structure to the LunarClient API, organized by domain category:

```
/api/auth/*          — Authentication & registration
/api/launcher/*      — Launcher metadata, status, mods, servers
/api/user/*          — User profiles
/api/server/*        — Server-side player lookups
/api/game/*          — In-game crash reporting
/api/index/*         — Cosmetics definitions catalogue
/api/content/*       — News, blog, announcements
/api/social/*        — Friends system, player search
/api/player/*        — Player role, cosmetics
/api/admin/*         — Admin panel (requires authentication)
```

---

## Authentication

### `POST /api/auth/register`
Register or update a player after Microsoft login.

**Request:**
```json
{ "username": "PlayerName", "uuid": "550e8400-..." }
```

**Response:**
```json
{ "username": "PlayerName", "playerId": "abc123", "role": "" }
```

---

## Launcher

### `GET /api/launcher/metadata`
Aggregated launcher data — versions, announcements, servers, cosmetics.

**Response:**
```json
{
  "version": "2.0.0",
  "versions": [
    { "id": "1.21.4", "label": "Minecraft 1.21.4", "color": "#3b82f6", "sub": "Latest Release" }
  ],
  "announcements": [ ... ],
  "servers": [ ... ],
  "cosmetics": [ ... ]
}
```

### `GET /api/launcher/servers`
Returns the configured server list (from `servers.json`).

**Response:**
```json
[
  { "name": "String Client Hub", "online": "127.0.0.1:25565", "ip": "127.0.0.1", "version": "1.21.x" }
]
```

### `GET /api/launcher/status`
Service health with player count.

**Response:**
```json
{ "online": true, "players": 42, "version": "2.0.0" }
```

### `POST /api/launcher/moderation/nsfw`
Check text for NSFW content (stub — extend with real checks).

### `POST /api/launcher/moderation/profanity`
Check text for profanity (stub — extend with real checks).

**Request:**
```json
{ "text": "message to check" }
```

**Response:**
```json
{ "flagged": false, "categories": [] }
```

### `GET /api/versions`
List all available Minecraft versions with metadata.

### `GET /api/version-banners`
Map of version IDs to banner image paths.

---

## User

### `GET /api/user/profile?playerId=<id>`
Full user profile.

**Response:**
```json
{
  "username": "PlayerName",
  "uuid": "550e8400-...",
  "playerId": "abc123",
  "role": "Owner",
  "skin": "https://...",
  "cape": "https://...",
  "cosmetics": [],
  "friends": []
}
```

---

## Server

### `GET /api/server/player-info/{uuid}`
Look up a player by their Minecraft UUID.

**Response:**
```json
{
  "uuid": "550e8400-...",
  "username": "PlayerName",
  "online": true,
  "role": "Admin",
  "hasSubscription": false
}
```

---

## Game

### `POST /api/game/crashReport`
Submit a crash report. Saved to `crash-reports.json`.

**Request:**
```json
{
  "version": "1.21.4",
  "error": "OutOfMemoryError",
  "stacktrace": "java.lang.OutOfMemoryError: ...",
  "log": "optional log content"
}
```

**Response:**
```json
{ "id": "uuid", "message": "Crash report submitted" }
```

---

## Index (Cosmetics Catalogue)

### `GET /api/index/cosmetics`
Returns all available cosmetics definitions (from `cosmetics.json`).

**Response:**
```json
[
  { "id": "dragon_cape", "name": "Dragon Cape", "type": "cape", "image": "https://...", "rarity": "legendary" }
]
```

---

## Content

### `GET /api/news`
Latest announcements (from `news.json`).

### `GET /api/blog`
Blog posts (from `blog.json`).

---

## Social

### `GET /api/friends?playerId=<id>`
Get a player's friends list.

### `POST /api/friends/add`
Add a friend.

**Request:**
```json
{ "playerId": "abc123", "username": "PlayerName" }
```

### `POST /api/friends/remove`
Remove a friend.

**Request:**
```json
{ "playerId": "abc123", "friendId": "def456" }
```

### `GET /api/players/search?q=<query>`
Search registered players by name.

---

## Player

### `GET /api/player/role?playerId=<id>`
Get a player's staff role.

**Response:**
```json
{ "role": "Admin" }
```

### `GET /api/cosmetics`
Get cosmetics data (equipped items, etc.).

### `PUT /api/cosmetics`
Update equipped cosmetics.

**Request:**
```json
{ "playerId": "abc123", "equipped": ["dragon_cape"] }
```

---

## WebSocket

Connect to `wss://stringclient.com` (same port as HTTP).

### Message Types

| Type | Direction | Description |
|---|---|---|
| `identify` | Client → Server | Authenticate with `{ username, playerId }` |
| `chat` | Bidirectional | Global chat message; prefix `/` for commands |
| `private-chat` | Bidirectional | Private message with `{ to, text }` |
| `system` | Server → Client | System notification (moderation, join/leave) |
| `online-update` | Server → Client | `{ online: [{ name, id, role }] }` |
| `notification` | Server → Client | Push notification |
| `welcome` | Server → Client | `{ clientId }` on connect |

### Chat Commands (Staff only — Owner/Admin)

| Command | Description |
|---|---|
| `/mute <name> [minutes]` | Mute a player (default 5 min) |
| `/unmute <name>` | Unmute a player |
| `/kick <name>` | Kick a player from chat |
| `/ban <name>` | Ban a player from chat |
| `/unban <name>` | Unban a player |
| `/warn <name> <reason>` | Send a warning to a player |
| `/clear` | Clear chat for everyone |
| `/slowmode <seconds>` | Set global chat slowmode (0 = off) |
| `/say <message>` | Server announcement |
| `/list` | List online players with roles |

### Spam Protection (non-staff)

- **Rate limit**: max 6 messages per 10s window → auto-mute 10 min
- **Duplicate filter**: identical message >2× in a row blocked
- **Max length**: 500 characters
- **Slowmode**: if enabled, enforced per-message

---

## Configuration Files (server directory)

| File | Purpose |
|---|---|
| `players.json` | Player database (username, uuid, role, cosmetics, friends) |
| `news.json` | Announcements for the launcher home tab |
| `blog.json` | Blog posts |
| `versions.json` | Available Minecraft versions with metadata |
| `cosmetics.json` | Cosmetics definitions |
| `servers.json` | Recommended server list |
| `crash-reports.json` | Submitted crash reports |
| `media/versions/` | Version banner images + `index.json` |
| `media/blog/` | Blog post images |

---

## Error Responses

All errors return:
```json
{ "error": "Description of what went wrong" }
```

Common HTTP codes: `200`, `400`, `401`, `404`.
