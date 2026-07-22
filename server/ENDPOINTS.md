# String Client — API & Bot Reference

## HTTP API Endpoints

### Launcher
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/launcher/metadata` | Launcher metadata (versions, news, config) |
| GET | `/api/launcher/servers` | Recommended server list |
| GET | `/api/launcher/status` | Launcher service status |
| POST | `/api/launcher/moderation/nsfw` | NSFW content check |
| POST | `/api/launcher/moderation/profanity` | Profanity filter |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register/authenticate a Microsoft auth user |
| GET | `/api/admin/auth/discord` | Discord OAuth2 login redirect |
| GET | `/api/admin/auth/callback` | Discord OAuth2 callback |
| POST | `/api/admin/auth/check` | Verify admin session token |
| POST | `/api/admin/login` | Password-based admin login |

### User / Player
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/profile` | Current user profile |
| GET | `/api/player/role` | Player role lookup |
| GET | `/api/players/search?q=` | Search registered players |
| GET | `/api/server/player-info/{uuid}` | Minecraft player info by UUID |

### Friends
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/friends?playerId=` | List accepted friends |
| GET | `/api/friends/requests?playerId=` | List incoming friend requests |
| POST | `/api/friends/add` | Send friend request |
| POST | `/api/friends/accept` | Accept friend request |
| POST | `/api/friends/reject` | Reject friend request |
| POST | `/api/friends/remove` | Remove friend |

### Cosmetics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cosmetics?playerId=` | Player's cosmetics (with enabled state) |
| PUT | `/api/cosmetics` | Toggle cosmetic for player |
| GET | `/api/cosmetics-defs` | All cosmetic definitions |
| GET | `/api/index/cosmetics` | Public cosmetics index |

### Game
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game/crashReport` | Submit crash report |
| GET | `/api/versions` | Game versions list |
| GET | `/api/version-banners` | Version banner images |

### Content
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/news` | List public news |
| POST | `/api/news` | Create news (requires token) |
| DELETE | `/api/news` | Delete news (requires token) |
| GET | `/api/blog` | Blog posts |
| GET | `/api/admin/versions` | Admin: list versions |
| POST | `/api/admin/versions` | Admin: add version |
| PUT | `/api/admin/versions/:id` | Admin: update version |
| DELETE | `/api/admin/versions/:id` | Admin: delete version |
| GET | `/api/admin/banners` | Admin: list banners |
| PUT | `/api/admin/banners/:version` | Admin: upload banner |
| DELETE | `/api/admin/banners/:version` | Admin: delete banner |
| GET | `/api/admin/news` | Admin: list news |
| POST | `/api/admin/news` | Admin: create news |
| DELETE | `/api/admin/news/:id` | Admin: delete news |
| GET | `/api/admin/blog` | Admin: list blog |
| POST | `/api/admin/blog` | Admin: create blog |
| DELETE | `/api/admin/blog/:id` | Admin: delete blog |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/players` | List all players |
| PUT | `/api/admin/players/:playerId/cosmetics` | Set player cosmetics |
| PUT | `/api/admin/players/:playerId/role` | Set player role |
| GET | `/api/admin/cosmetics` | List all cosmetics |
| POST | `/api/admin/cosmetics` | Create cosmetic |
| PUT | `/api/admin/cosmetics/:id` | Update cosmetic |
| DELETE | `/api/admin/cosmetics/:id` | Delete cosmetic |
| GET | `/api/admin/stats` | Server statistics |
| GET | `/api/health` | Health check |

### Discord Presence (Lanyard)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lanyard/:userId` | Discord presence for a user |
| GET | `/api/lanyard` | All tracked Discord presences |

### Static Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin panel UI |
| GET | `/` | Launcher renderer (built SPA) |
| GET | `/logo.png` | String Client logo |
| GET | `/media/*` | Static media files |

---

## WebSocket Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `identify` | Client → Server | Register connection with `{ username, playerId }` |
| `chat` | Client → Server | Send a chat message (or command) |
| `chat:delete` | Client → Server | Staff delete a message by `msgId` |
| `private-chat` | Client → Server | Send private message to a friend `{ to, text }` |

### Server → Client broadcasts

| Type | Description |
|------|-------------|
| `chat` | Public chat message with `{ id, username, role, text, time }` |
| `private-chat` | Private message with `{ from, fromId, text, time [, sent] }` |
| `chat:clear` | Staff cleared all chat messages |
| `chat:delete` | Staff deleted a message (contains `msgId`) |
| `chat:lock` | Chat lockdown toggled `{ locked: boolean }` |
| `online-update` | Online player list changed |
| `system` | System message (info, error, moderation actions) |

### Chat Commands (via `/chat` message)

| Command | Permission | Description |
|---------|-----------|-------------|
| `/clear` | Owner/Admin | Clear all chat messages |
| `/lock` | Owner/Admin | Toggle chat lockdown (prevents non-staff from chatting) |
| `/slowmode <sec>` | Owner/Admin | Set slowmode delay between messages (0 = off) |
| `/say <text>` | Owner/Admin | Broadcast announcement as system message |
| `/list` | Owner/Admin | List online players with roles |
| `/mute <player> [min]` | Owner/Admin | Mute a player (default 5 min) |
| `/unmute <player>` | Owner/Admin | Unmute a player |
| `/warn <player> <reason>` | Owner/Admin | Send warning to a player |
| `/kick <player>` | Owner/Admin | Disconnect a player from chat |
| `/ban <player>` | Owner/Admin | Ban a player from global chat |
| `/unban <player>` | Owner/Admin | Unban a player |

### Rate Limits / Spam Protection

| Limit | Value |
|-------|-------|
| Max message length | 500 characters |
| Spam window | 10 seconds |
| Max messages per window | 5 |
| Auto-mute duration | 5 minutes |
| Duplicate message limit | 3 repeats allowed |

---

## Discord Bot (`discord-bot.js`)

### Slash Commands

| Command | Subcommand | Description | Permission |
|---------|-----------|-------------|-----------|
| `/news` | `post` | Opens a modal to create news — fields: Title, Text, Image URL (opt), Tag (opt, default "Update"), Link URL (opt). On submit, posts to HTTP API and auto-sends embed to `NEWS_CHANNEL_ID`. | Admin role or Administrator |
| `/news` | `list` | Shows the 10 most recent news entries with ID, title, and tag. | Anyone |
| `/news` | `delete` | Deletes a news entry by ID. | Admin role or Administrator |

### Intents
- `Guilds` — guild/slash command management
- `GuildPresences` — presence/lanyard tracking
- `GuildMembers` — member list for initial presence fetch

### Allowed Role IDs (hardcoded)
```
1525047958553366600
1524856161697005598
1506634520017764493
1506634289381380328
```

### Lanyard Presence Tracking

The bot tracks all guild member presences and saves them to `presence.json`. Updates on:
- **Bot ready** — fetches all guild members' initial presences
- **`presenceUpdate`** event — saves changes in real-time

Each presence includes: `userId`, `discord_status`, `activities` (type, state, details, timestamps, assets, party, emoji), device flags (`active_on_discord_web/desktop/mobile`).

Served via `GET /api/lanyard/:userId` and `GET /api/lanyard`.

### Env Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `BOT_TOKEN` | Yes | Shared secret for HTTP API auth |
| `API_URL` | No | Backend URL (default: `http://localhost:3001`) |
| `NEWS_CHANNEL_ID` | No | Channel ID for auto-posting news embeds |
| `DISCORD_CLIENT_ID` | For OAuth | Discord OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | For OAuth | Discord OAuth2 client secret |
| `ADMIN_DISCORD_GUILD_ID` | For OAuth | Guild ID for admin Discord verification |
| `ADMIN_DISCORD_ROLE_IDS` | For OAuth | Comma-separated admin role IDs |
