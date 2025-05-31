# RAGE-NSFW Music & Moderation Discord Bot

A modern, feature-rich Discord bot for music playback and image moderation.  
Supports fancy queue paging, NSFW image scanning, moderation settings per guild, and interactive controls.

---

## 🎵 Music Features

- **/play `<YouTube link or keywords>`**  
  Play or queue a YouTube song by link, search, or playlist.  
  Supports both direct URLs and keyword search.

- **/queue**  
  View the current song queue with **fancy paginated navigation** (Next/Back buttons).  
  See what's now playing and easily browse what's next!

- **/commands**  
  See all available bot commands and usage info.

- **Interactive Music Controls**  
  ⏯️ Pause/Resume, ⏭️ Skip, 🛑 Stop, 🔉 Volume Down, 🔊 Volume Up — directly from the Discord chat via buttons.

- **Song Selection Menu**  
  Quickly view and select queued tracks via dropdown.

---

## 🛡️ Moderation Features

- **NSFW Image Scanning**  
  Automatic and on-demand scanning using Sightengine and custom thresholds.
  - `/nsfwcheck <image>`: Check if an image is NSFW.
  - **Auto-scan:** All images uploaded to the server are auto-scanned with instant results in the channel.

- **Content Moderation Settings**  
  Granular per-guild controls for:
  - Nudity (raw/partial)
  - Weapons/Ammo/Drugs
  - Offensive Content

  Easily enable/disable checks and adjust thresholds via slash commands.

- **Sightengine Model Selection**  
  Choose which Sightengine moderation models to activate for your server.

---

## 🛠️ Admin Settings Commands

- **/setmoderation `<category>` `<enabled>`**  
  Enable or disable checks for a content category.

- **/setthreshold `<threshold>` `<value>`**  
  Set detection thresholds for categories. If set to `0`, the check is auto-disabled.

- **/setcheck `<check>` `<enabled>`**  
  Manually enable/disable any moderation check key.

- **/showmoderation**  
  Display current moderation settings, thresholds, and Sightengine models.

---

## 🧩 Example Settings Output

```
**Current moderation settings:**
- nudity_raw: true
- nudity_partial: false
- wad: true
- offensive: true

**Thresholds:**
- nudity_raw: 0.7
- nudity_partial: 0.7
- offensive_prob: 0.7

**Sightengine Models:**
- nudity
- wad
```

---

## ✨ Example Music Queue Paging

> Using `/queue` shows a paginated ephemeral message:

```
🎶 **Music Queue (Page 1/3):**
**Now Playing:** Coolio - Gangsta's Paradise _(requested by hawkmyg)_
**#1:** Dr. Dre - Still D.R.E. _(requested by hawkmyg)_
**#2:** 2Pac - Hit 'Em Up _(requested by hawkmyg)_
**#3:** The Notorious B.I.G. - Juicy _(requested by hawkmyg)_
...and more!

⬅️ Back | Next ➡️
```

---

## ⚙️ Environment Variables

- `DISCORD_TOKEN` — your bot token
- `GUILD_ID` *(optional)* — for instant slash command registration (development only)
- (Sightengine API keys if using image moderation)

---

## 🚀 Quick Start

1. **Install dependencies:**  
   `npm install`

2. **Create `.env` file:**  
   ```
   DISCORD_TOKEN=your_token
   GUILD_ID=your_server_id   # for dev only
   ```

3. **Run the bot:**  
   `node bot.js`

---

## 🎉 Credits

- [discord.js](https://discord.js.org/)
- [@discordjs/voice](https://discord.js.org/#/docs/voice/main/general/welcome)
- [play-dl](https://github.com/Androz2091/play-dl)
- [Sightengine](https://sightengine.com/)

---

## 💡 Pro Tips

- Use `/queue` to see and page through your music lineup.
- Tweak thresholds and checks for perfect moderation balance.
- All moderation and queue actions are **ephemeral** (only you see them), keeping chat clean!