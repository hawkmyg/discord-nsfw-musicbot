# 🎵 Advanced Music + NSFW Moderation

A modern Discord bot for music playback and powerful server moderation, featuring per-guild NSFW detection, persistent music queue, robust slash commands, dynamic settings, auto-restoring controls, and more.

---

<div align="center">

## Support the Development of This Project!

<style>
.pp-GUB8H62HUYHB2{text-align:center;border:none;border-radius:0.25rem;min-width:11.625rem;padding:0 2rem;height:2.625rem;font-weight:bold;background-color:#FFD140;color:#000000;font-family:"Helvetica Neue",Arial,sans-serif;font-size:1rem;line-height:1.25rem;cursor:pointer;}
</style>

<!-- PayPal Button for Markdown users: use the link below. The button itself is only for HTML. -->
[![Buy Now](https://www.paypalobjects.com/en_US/i/btn/btn_buynow_LG.gif)](https://www.paypal.com/ncp/payment/GUB8H62HUYHB2)
<br>
<img src="https://www.paypalobjects.com/images/Debit_Credit_APM.svg" alt="cards" height="32"/>
<br>
<sub>Powered by <img src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg" alt="paypal" height="16" style="vertical-align:middle;"/></sub>

</div>

---

## ✨ Features

- **Music Player**
  - `/play <url or keywords>`: Play or queue YouTube songs or playlists
  - `/queue`: View, page, and manage the music queue
  - **Persistent queue**: Music queue and state survive bot restarts
  - **Auto-restore**: "Now Playing" embed and controls will automatically reappear if deleted
  - Modern Discord.js v14+ codebase with *slash commands only*
  - **Interactive**: Intuitive control buttons (pause/resume/skip/stop/volume) and a song selection dropdown
  - **Per-guild settings**: Restrict music commands to specific voice/text channels

- **NSFW Moderation**
  - Automatic NSFW image detection on all uploads (per-guild configurable)
  - `/nsfwcheck`: Manual image scan
  - Per-guild moderation: Enable/disable categories (nudity, offensive, WAD, etc)
  - Admin-only moderation commands for configuration and thresholds
  - All moderation settings persisted in `moderation_settings.json`

- **Admin & Utility**
  - `/reload`: Reload config at runtime (admin only, confirmation auto-deletes!)
  - Dynamic settings: Change config without restarting the bot
  - Robust error handling for all commands

- **Persistence & Safety**
  - All music and moderation settings are saved to disk and survive bot restarts

- **Example and Environment**
  - Example `.env` file and configuration guidance included

---

## 🚀 Getting Started

1. **Install [FFMPEG](https://ffmpeg.org/download.html) (Required for Music Playback)**

   - **Windows:**
     - Download from [ffmpeg.org/download.html](https://ffmpeg.org/download.html)
     - Unzip the folder (e.g., `ffmpeg-*-win64-static.zip`)
     - Copy the `bin` folder path (contains `ffmpeg.exe`)
     - Add it to your system **PATH**:
       - Search "Edit the system environment variables" → Environment Variables
       - Under "System variables" find and edit **Path**
       - Add the full path to the `bin` folder.

   - **Verify Installation:**
     ```
     ffmpeg -version
     ```
     You should see FFMPEG version info.

2. **Configure Environment**
   ```sh
   cp example.env .env
   ```
   Edit `.env` to include:
   ```env
   DISCORD_TOKEN=your_discord_token_here
   GUILD_ID=your_guild_id_here # (optional, for guild-specific command registration)
   MUSIC_ROOM_VOICE_ID=voice_channel_id # (optional, restricts music commands)
   REQUEST_TEXT_CHANNEL_ID=text_channel_id # (optional, restricts music commands)
   ```

3. **Run the Bot**
   ```sh
   node bot.js
   ```

---

## 💡 Commands

### Music

- `/play <YouTube link or keywords>` – Queue a song or playlist
- `/queue` – Show the current music queue (with pagination & controls)
- `/commands` – List all music commands
- Playback controls: Pause, resume, skip, stop, and volume via interactive buttons under the music message
- Song selection menu for quick jumps or info in the queue
- **Auto-restore**: If the Now Playing embed is deleted, it will reappear within 30 seconds as long as there is music in the queue

### NSFW Moderation

- `/nsfwcheck <image>` – Manually check an image for NSFW content
- Automatic NSFW checks on all uploaded images
- **Admin moderation commands (all per-guild):**
  - `/setmoderation <category> <enabled>` – Enable/disable categories (nudity, offensive, etc)
  - `/setthreshold <category> <value>` – Set detection threshold (0-1)
  - `/setcheck <check> <enabled>` – Manually toggle any moderation check
  - `/showmoderation` – Show current moderation settings

### Utility

- `/reload` – Reload configuration and settings live (admin only, confirmation auto-deletes)

---

## 🛡️ Permissions

- Send Messages, Manage Messages (for auto-deletion)
- Embed Links, Attach Files, Read Message History
- Connect/Speak (for music)
- Use Slash Commands
- Administrator *(optional but recommended for full functionality)*

---

## 🔧 Settings

All music queue and moderation settings are stored in `persistent-queue.json` and `moderation_settings.json` and are auto-managed by the bot.  
**Do not edit these files by hand unless you know what you're doing.** Use the slash commands to configure.

---

## 🧪 Example `.env`

```env
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

**MIT**