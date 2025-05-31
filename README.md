# RAGE-NSFW Discord Bot

A multipurpose Discord bot featuring **automatic image moderation** (NSFW, offensive, weapons/drugs detection) and a **fancy YouTube music player** with playlist support, live volume buttons, and stylish Now Playing embeds.

---

## ✨ Features

### 🛡️ Moderation

- **Automatic NSFW/Offensive Image Moderation**  
  Scans posted images for:
  - Nudity (raw & partial)
  - Weapons/Ammo/Drugs
  - Offensive content
- **Customizable Per-Category Checks**  
  Enable/disable moderation for each type independently.
- **Adjustable Detection Thresholds**  
  Fine-tune sensitivity for each category.
- **Admin Moderation Commands**
- **Automatic Message Deletion & User Notification**  
  When a violation is detected.

---

### 🎵 Fancy Music Player

- **/play**  
  Play or queue YouTube songs by link, keywords, or *entire playlists*.
- **/queue**  
  Show the current music queue.
- **Fancy Now Playing Embed**  
  - Shows song title (as a link), who requested it, and the current volume.
  - Looks great and updates live!
- **Control Buttons** *(max 5 per message, always visible for all users)*:
  - **Pause/Resume** (single toggle button)
  - **Skip**
  - **Stop**
  - **Volume Down (🔉) / Volume Up (🔊)**
    - Instantly adjust volume from 5% to 200%, live!
- **Song Selection Menu**  
  Jump to or view any song in the queue.

---

### ⚙️ Moderation/Settings Commands

- **/setthreshold**  
  Set detection threshold for each moderation category (0–1, lower = more sensitive).
- **/setmoderation**  
  Enable or disable a moderation category.
- **/setcheck**  
  Directly enable/disable individual checks (e.g., raw, partial, offensive).
- **/showmoderation**  
  View current moderation settings.
- **/commands**  
  See all available bot commands.

---

## 🎚️ Example Settings (`moderation_settings.json`)

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
- **thresholds**: Set the probability threshold (`0`–`1`), lower is stricter.

---

## 🚀 Usage

- **Music:**  
  `/play <YouTube link | keywords | playlist>`  
  `/queue`  
  Use the interactive buttons below the Now Playing message:  
  ⏯ Pause/Resume • ⏭ Skip • ⏹ Stop • 🔉 Volume Down • 🔊 Volume Up
- **Moderation Settings (admin only):**  
  `/setthreshold <category> <value>`  
  `/setmoderation <category> <true|false>`  
  `/setcheck <category> <true|false>`  
  `/showmoderation`
- **Help:**  
  `/commands` (shows all features and usage)

---

## 📦 Requirements

- Node.js v18+
- Discord bot token
- Sightengine API key (for image moderation)
- YouTube Data/API access

---

## 📝 License

MIT

---

**Enjoy your secure, stylish, and music-filled Discord experience!**