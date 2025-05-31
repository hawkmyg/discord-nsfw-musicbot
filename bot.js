import { Client, GatewayIntentBits, Partials, REST, Routes, Events, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import nsfwCheck from './nsfw.js';
import { playCommand, handleMusicButton, handleMusicMenu } from './music.js';

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
    nudity: true,
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
          { name: 'Nudity', value: 'nudity' },
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
    name: 'showmoderation',
    description: 'Show current moderation settings',
    options: []
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
    await nsfwCheck(interaction, attachment.url);
    return;
  }

  if (interaction.commandName === 'play') {
    await playCommand(client, interaction);
    return;
  }

  if (['setmoderation', 'setthreshold'].includes(interaction.commandName)) {
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

  if (interaction.commandName === 'setthreshold') {
    const threshold = interaction.options.getString('threshold');
    const value = interaction.options.getNumber('value');
    if (value < 0 || value > 1) {
      await interaction.reply({ content: "Threshold value must be between 0 and 1.", flags: 1 << 6 });
      return;
    }
    const settings = getGuildSettings(guildId);
    settings.thresholds[threshold] = value;
    await saveSettings();
    await interaction.reply(`Threshold for **${threshold}** set to **${value}**.`);
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

client.login(process.env.DISCORD_TOKEN);
