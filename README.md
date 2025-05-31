# Discord Moderation & Music Bot

A multipurpose Discord bot featuring **image moderation (NSFW, offensive, weapons/drugs detection)** and a **YouTube music player** with playlist support.

---

## Features

### 🛡️ Moderation

- **Automatic NSFW/Offensive Image Moderation**  
  Scans all posted images for:
  - Nudity (raw & partial)
  - Weapons/Ammo/Drugs
  - Offensive content
- **Customizable Per-Category Checks**  
  Enable/disable moderation for each category independently.
- **Adjustable Detection Thresholds**  
  Fine-tune sensitivity for nudity, offensive, and other categories.
- **Admin Commands for Moderation Settings**
- **Automatic Message Deletion & User Notification**  
  When violating images are detected.

### 🎵 Music

- **/play**  
  Play or queue YouTube songs by link, keywords, or *entire playlists*.
- **/queue**  
  Show the current music queue.
- **Control Buttons**  
  Pause, resume, skip, and stop playback via interactive buttons.
- **Song Selection Menu**  
  Jump to or view any song in the queue.

### ⚙️ Admin Settings Commands

- **/setthreshold**  
  Set the detection threshold for each moderation category (0–1).
- **/setmoderation**  
  Enable or disable a content moderation category.
- **/setcheck**  
  Directly enable or disable any moderation check (raw, partial, offensive, etc).
- **/showmoderation**  
  View current moderation settings.
- **/commands**  
  See all available bot commands.

---

## Example Settings (`moderation_settings.json`)

```json
{
  "123456789012345678": {
    "checks": {
      "nudity_raw": true,
      "nudity_partial": false,
      "wad": true,
      "offensive": true
    },
    "thresholds": {
      "nudity_raw": 0.7,
      "nudity_partial": 0.4,
      "offensive_prob": 0.6
    }
  }
}
```

- Each server (guild) has its own settings section (keyed by guild ID).
- **checks**: Enable (`true`) or disable (`false`) each moderation category.
- **thresholds**: Set the probability threshold (0–1, lower is stricter).

---

## Usage

- **Music:**  
  `/play <YouTube link | keywords | playlist>`  
  `/queue`  
  Use the interactive buttons for pause/resume/skip/stop.
- **Moderation Settings (admin only):**  
  `/setthreshold <category> <value>`  
  `/setmoderation <category> <true|false>`  
  `/setcheck <category> <true|false>`  
  `/showmoderation`
- **Help:**  
  `/commands` or `!commands` (prefix)

---

## Requirements

- Node.js v18+
- Discord bot token
- Sightengine API key (for image moderation)
- YouTube Data/API access

---

## License

MIT
