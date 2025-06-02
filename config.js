import dotenv from "dotenv";
import fs from "fs";

// Loads .env and updates process.env (initial and on reload)
function loadEnv() {
  if (fs.existsSync(".env")) {
    dotenv.config({ override: true });
  }
}

// Helper to parse and typecast config from process.env
function parseConfig() {
  return {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    SIGHTENGINE_USER: process.env.SIGHTENGINE_USER,
    SIGHTENGINE_SECRET: process.env.SIGHTENGINE_SECRET,
    MUSIC_ROOM_STRICT: process.env.MUSIC_ROOM_STRICT === "true",
    MUSIC_ROOM_VOICE_ID: process.env.MUSIC_ROOM_VOICE_ID,
    REQUEST_TEXT_CHANNEL_STRICT: process.env.REQUEST_TEXT_CHANNEL_STRICT === "true",
    REQUEST_TEXT_CHANNEL_ID: process.env.REQUEST_TEXT_CHANNEL_ID,
  };
}

// Cached config object
let config = null;

// Always load env on startup
loadEnv();
config = parseConfig();

export function getConfig() {
  if (!config) config = parseConfig();
  return config;
}

export function reloadConfig() {
  loadEnv();
  config = parseConfig();
  console.log("Config reloaded from .env");
}

export default getConfig();