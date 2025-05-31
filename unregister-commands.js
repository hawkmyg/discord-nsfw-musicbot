import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // The Bot's Application ID
const GUILD_ID = process.env.GUILD_ID;   // Optional: For per-guild, else leave undefined

if (!TOKEN || !CLIENT_ID) {
  console.error("DISCORD_TOKEN and CLIENT_ID must be set in your .env file.");
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function unregisterCommands() {
  try {
    if (GUILD_ID) {
      // For guild-specific commands
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: [] }
      );
      console.log(`✅ All guild commands deleted for guild ${GUILD_ID}`);
    } else {
      // For global commands
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: [] }
      );
      console.log(`✅ All global commands deleted.`);
    }
  } catch (error) {
    console.error('Error unregistering commands:', error);
  }
}

unregisterCommands();