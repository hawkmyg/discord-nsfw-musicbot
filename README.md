# Discord Music & Moderation Bot

A modern Discord bot for music playback and powerful server moderation, featuring per-guild NSFW detection, robust slash commands, dynamic settings, and auto-deleting admin actions.

---

## ✨ Features

- **Music Player**
  - `/play <url or keywords>`: Play or queue YouTube songs/playlists
  - `/queue`: View, page, and manage the music queue
  - Song selection menus and intuitive control buttons (pause/resume/skip/stop/volume)
  - Modern Discord.js v14+ codebase

- **NSFW Moderation**
  - Automatic NSFW image detection on uploads (per-guild)
  - `/nsfwcheck`: Manual image scan
  - Per-guild settings and thresholds for nudity, offensive, and WAD (Weapons/Ammo/Drugs)
  - Admin-only moderation commands for configuration

- **Admin & Utility**
  - `/reload`: Reload configuration at runtime (admin only, auto-deletes confirmation)
  - Robust error handling for all commands
  - Slash command registration with up-to-date Discord.js conventions

- **Settings & Persistence**
  - All moderation and threshold settings are saved per guild in `moderation_settings.json`
  - Live configuration reload with `/reload`

- **Example and Environment**
  - Example `.env` file and configuration guidance included

---

## 🚀 Getting Started

### 1. Install [FFMPEG](https://ffmpeg.org/) (Required for Music Playback)

**FFMPEG is required for audio streaming.  
You must install it and ensure it's available in your system PATH.**

#### Windows

- Download from [ffmpeg.org/download.html](https://ffmpeg.org/download.html)
- Unzip the folder (e.g., `ffmpeg-*-win64-static.zip`)
- Copy the `bin` folder path (contains `ffmpeg.exe`)
- Add it to your system `PATH`:
  - Search "Edit the system environment variables" → Environment Variables → Under "System variables" find and edit `Path` → Add the full path to the `bin` folder.

#### Verify Installation

After install, run:

```bash
ffmpeg -version
```

You should see FFMPEG version info.

---

### 2. Configure Environment

Copy the example environment file and fill in your bot token and options:

```bash
cp example.env .env
```

Edit `.env` to include:

```
DISCORD_TOKEN=your_discord_token_here
GUILD_ID=your_guild_id_here # (optional, for guild-specific command registration)
MUSIC_ROOM_VOICE_ID=voice_channel_id # (optional, restricts music commands)
REQUEST_TEXT_CHANNEL_ID=text_channel_id # (optional, restricts music commands)
```

---

### 3. Run the Bot

```bash
node bot.js
```

---

## 💡 Commands

### Music

- `/play <YouTube link or keywords>` – Queue a song or playlist
- `/queue` – Show the current music queue (with pagination)
- `/commands` – List all music commands

#### Controls

- Pause, resume, skip, stop, and volume via interactive buttons under the music message
- Song selection menu for quick jumps in the queue

### NSFW Moderation

- `/nsfwcheck <image>` – Manually check an image for NSFW content
- Automatic NSFW checks on all uploaded images

#### Moderation Settings (Admin only)

- `/setmoderation <category> <enabled>` – Enable/disable categories (nudity, offensive, etc)
- `/setthreshold <category> <value>` – Set detection threshold (0-1)
- `/setcheck <check> <enabled>` – Manually toggle any moderation check
- `/showmoderation` – Show current moderation settings

### Utility

- `/reload` – Reload configuration (confirmation auto-deletes, admin only)

---

## 🛡️ Permissions

Make sure your bot has the following permissions:

- Send Messages, Manage Messages (for auto-deletion)
- Embed Links, Attach Files, Read Message History
- Connect/Speak (for music)
- Use Slash Commands

---

## 🔧 Settings

All moderation settings are stored in `moderation_settings.json` — do **not** edit it by hand unless you know what you're doing. Use the slash commands to configure.

---

## 🧪 Example `.env`

```
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=123456789012345678
MUSIC_ROOM_VOICE_ID=123456789012345678
REQUEST_TEXT_CHANNEL_ID=123456789012345678
```

---

## 📂 Example Settings (`moderation_settings.json`)

```json
{
  "123456789012345678": {
    "checks": {
      "nudity_raw": true,
      "nudity_partial": true,
      "wad": true,
      "offensive": true
    },
    "thresholds": {
      "nudity_raw": 0.7,
      "nudity_partial": 0.7,
      "offensive_prob": 0.7
    }
  }
}
```

---

## 📝 License

MIT

---