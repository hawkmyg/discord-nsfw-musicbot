import dotenv from 'dotenv';
dotenv.config();

let config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  SIGHTENGINE_USER: process.env.SIGHTENGINE_USER,
  SIGHTENGINE_SECRET: process.env.SIGHTENGINE_SECRET,
  MUSIC_ROOM_STRICT: process.env.MUSIC_ROOM_STRICT === 'true',
  MUSIC_ROOM_VOICE_ID: process.env.MUSIC_ROOM_VOICE_ID,
  REQUEST_TEXT_CHANNEL_STRICT: process.env.REQUEST_TEXT_CHANNEL_STRICT === 'true',
  REQUEST_TEXT_CHANNEL_ID: process.env.REQUEST_TEXT_CHANNEL_ID,
};

export async function reloadConfig() {
  dotenv.config();
  config = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    SIGHTENGINE_USER: process.env.SIGHTENGINE_USER,
    SIGHTENGINE_SECRET: process.env.SIGHTENGINE_SECRET,
    MUSIC_ROOM_STRICT: process.env.MUSIC_ROOM_STRICT === 'true',
    MUSIC_ROOM_VOICE_ID: process.env.MUSIC_ROOM_VOICE_ID,
    REQUEST_TEXT_CHANNEL_STRICT: process.env.REQUEST_TEXT_CHANNEL_STRICT === 'true',
    REQUEST_TEXT_CHANNEL_ID: process.env.REQUEST_TEXT_CHANNEL_ID,
  };
}

export function getConfig() {
  return config;
}

export default config;