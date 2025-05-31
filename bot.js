import { Client, GatewayIntentBits, Partials, REST, Routes, Events, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import nsfwCheck from './nsfw.js';
import { playCommand, handleMusicButton, handleMusicMenu, commandsCommand } from './music.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

const SETTINGS_FILE = path.resolve('./moderation_settings.json');
const DEFAULT_SETTINGS = {
  checks: {
    nudity_raw: true,
    nudity_partial: true,
    wad: true,
    offensive: true,
  },
  thresholds: {
    nudity_raw: 0.7,
    nudity_partial: 0.7,
    offensive_prob: 0.7,
  }
};
let moderationSettings = {};

async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    moderationSettings = JSON.parse(data);
  } catch (e) {
    moderationSettings = {};
  }
}

async function saveSettings() {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(moderationSettings, null, 2));
}

function getGuildSettings(guildId) {
  if (!moderationSettings[guildId]) {
    moderationSettings[guildId] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  } else {
    moderationSettings[guildId].checks = { ...DEFAULT_SETTINGS.checks, ...moderationSettings[guildId].checks };
    moderationSettings[guildId].thresholds = { ...DEFAULT_SETTINGS.thresholds, ...moderationSettings[guildId].thresholds };
  }
  return moderationSettings[guildId];
}

// Register Slash Commands
const commands = [
  {
    name: 'nsfwcheck',
    description: 'Check if an image is NSFW',
    options: [{
      name: 'image',
      type: 11, // Attachment
      description: 'Image to check',
      required: true
    }]
  },
  {
    name: 'play',
    description: 'Play a YouTube song',
    options: [{
      name: 'query',
      type: 3, // String
      description: 'YouTube link or keywords',
      required: true
    }]
  },
  {
    name: 'setmoderation',
    description: 'Enable or disable specific content checks',
    options: [
      {
        name: 'category',
        type: 3, // String
        description: 'Check to enable/disable',
        required: true,
        choices: [
          { name: 'Nudity (raw)', value: 'nudity_raw' },
          { name: 'Nudity (partial)', value: 'nudity_partial' },
          { name: 'Weapons/Ammo/Drugs', value: 'wad' },
          { name: 'Offensive', value: 'offensive' }
        ]
      },
      {
        name: 'enabled',
        type: 5, // Boolean
        description: 'Enable this check? True/False',
        required: true
      }
    ]
  },
  {
    name: 'setthreshold',
    description: 'Set detection threshold for a category',
    options: [
      {
        name: 'threshold',
        type: 3, // String
        description: 'Which threshold to set',
        required: true,
        choices: [
          { name: 'Nudity (raw)', value: 'nudity_raw' },
          { name: 'Nudity (partial)', value: 'nudity_partial' },
          { name: 'Offensive (prob)', value: 'offensive_prob' }
        ]
      },
      {
        name: 'value',
        type: 10, // Number
        description: 'Threshold value (0-1)',
        required: true
      }
    ]
  },
  {
    name: 'setcheck',
    description: 'Manually enable or disable any moderation check',
    options: [
      {
        name: 'check',
        type: 3, // String
        description: 'The check key to enable/disable',
        required: true,
        choices: [
          { name: 'Nudity (raw)', value: 'nudity_raw' },
          { name: 'Nudity (partial)', value: 'nudity_partial' },
          { name: 'Weapons/Ammo/Drugs', value: 'wad' },
          { name: 'Offensive', value: 'offensive' }
        ]
      },
      {
        name: 'enabled',
        type: 5, // Boolean
        description: 'Enable this check? True/False',
        required: true
      }
    ]
  },
  {
    name: 'showmoderation',
    description: 'Show current moderation settings',
    options: []
  },
  {
    name: 'commands',
    description: 'List all music bot commands and info'
  }
];

// Use GUILD_ID from .env for instant command registration
const GUILD_ID = process.env.GUILD_ID;

// Register slash commands on startup
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, GUILD_ID),
        { body: commands }
      );
      console.log(`Slash commands registered to guild: ${GUILD_ID}`);
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log('Slash commands registered globally (may take up to an hour to appear).');
    }
  } catch (e) {
    console.error('Slash command registration error:', e);
  }
});

// Handle slash commands and music interaction in one event handler
client.on(Events.InteractionCreate, async interaction => {
  // Music button & menu handlers
  if (interaction.isButton()) {
    await handleMusicButton(interaction);
    return;
  }
  if (interaction.isStringSelectMenu()) {
    await handleMusicMenu(interaction);
    return;
  }

  // Only handle slash commands below
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "Commands must be run in a server.", flags: 1 << 6 });
    return;
  }
  await loadSettings();

  if (interaction.commandName === 'nsfwcheck') {
    const attachment = interaction.options.getAttachment('image');
    const settings = getGuildSettings(guildId);
    await nsfwCheck(interaction, attachment.url, settings);
    return;
  }

  if (interaction.commandName === 'play') {
    await playCommand(client, interaction);
    return;
  }

  if (interaction.commandName === 'commands') {
    await commandsCommand(client, interaction);
    return;
  }

  if (['setmoderation', 'setthreshold', 'setcheck'].includes(interaction.commandName)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: "Only admins can change moderation settings.", flags: 1 << 6 });
      return;
    }
  }

  if (interaction.commandName === 'setmoderation') {
    const category = interaction.options.getString('category');
    const enabled = interaction.options.getBoolean('enabled');
    const settings = getGuildSettings(guildId);
    settings.checks[category] = enabled;
    await saveSettings();
    await interaction.reply(`Moderation for **${category}** set to **${enabled}**.`);
    return;
  }

  if (interaction.commandName === 'setcheck') {
    const check = interaction.options.getString('check');
    const enabled = interaction.options.getBoolean('enabled');
    const settings = getGuildSettings(guildId);
    if (settings.checks[check] === undefined) {
      await interaction.reply({ content: `Check key "${check}" does not exist.`, flags: 1 << 6 });
      return;
    }
    settings.checks[check] = enabled;
    await saveSettings();
    await interaction.reply(`Check **${check}** set to **${enabled}**.`);
    return;
  }

  if (interaction.commandName === 'setthreshold') {
    const threshold = interaction.options.getString('threshold');
    const value = interaction.options.getNumber('value');
    if (value < 0 || value > 1) {
      await interaction.reply({ content: "Threshold value must be between 0 and 1.", flags: 1 << 6 });
      return;
    }
    const settings = getGuildSettings(guildId);
    settings.thresholds[threshold] = value;
    // If threshold is 0, disable check. If threshold > 0, enable check.
    if (settings.checks[threshold] !== undefined) {
      if (value === 0) {
        settings.checks[threshold] = false;
      } else {
        settings.checks[threshold] = true;
      }
    }
    await saveSettings();
    let msg = `Threshold for **${threshold}** set to **${value}**.`;
    if (value === 0 && settings.checks[threshold] === false) {
      msg += `\n:information_source: Check **${threshold}** has been disabled because threshold is 0.`;
    }
    if (value > 0 && settings.checks[threshold] === true) {
      msg += `\n:information_source: Check **${threshold}** has been enabled because threshold is above 0.`;
    }
    await interaction.reply(msg);
    return;
  }

  if (interaction.commandName === 'showmoderation') {
    const settings = getGuildSettings(guildId);
    let msg = '**Current moderation settings:**\n';
    for (const cat in settings.checks) {
      msg += `- ${cat}: ${settings.checks[cat]}\n`;
    }
    msg += '\n**Thresholds:**\n';
    for (const th in settings.thresholds) {
      msg += `- ${th}: ${settings.thresholds[th]}\n`;
    }
    await interaction.reply(msg);
    return;
  }
});

// !commands message listener for prefix help + auto NSFW scan for images
client.on('messageCreate', async message => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // !commands text help
  if (message.content.trim().toLowerCase() === '!commands') {
    message.channel.send(
      "**Available Music Bot Commands:**\n" +
      "• `/play <YouTube link or keywords>` – Play or queue a YouTube song by link or search keywords.\n" +
      "• `/queue` – Show the current music queue.\n" +
      "• `/commands` – Show this list of bot commands (slash).\n" +
      "• `!commands` – Show this list of bot commands (prefix).\n" +
      "• Use the music control buttons (Pause/Resume/Skip/Stop) under the music message.\n" +
      "• Use the song selection menu to view/select tracks."
    );
    return;
  }

  // ------------ AUTO NSFW SCAN FOR IMAGES -------------
  if (message.attachments.size > 0) {
    const imageAttachments = message.attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    if (imageAttachments.size === 0) return;

    const guildId = message.guildId;
    if (!guildId) return; // If DM, skip

    await loadSettings();
    const settings = getGuildSettings(guildId);

    for (const [, attachment] of imageAttachments) {
      try {
        await nsfwCheck(
          { 
            deferReply: async () => {},
            editReply: async () => {},
            channel: message.channel
          },
          attachment.url,
          settings,
          { isAuto: true, message }
        );
      } catch (err) {
        console.error('Error auto-NSFW scanning:', err);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);