import { 
  Client, GatewayIntentBits, Partials, REST, Routes, Events, PermissionsBitField 
} from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import nsfwCheck from './nsfw.js';
import { 
  playCommand, 
  handleMusicButton, 
  handleMusicMenu, 
  commandsCommand, 
  queueCommand, 
  resumeAllQueuesOnStartup,
  startNowPlayingChecker // for auto-restoring player controls
} from './music.js';
import { getConfig, reloadConfig } from './config.js';

// Moderation settings (per guild, saved to disk)
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

// SLASH COMMANDS
const commands = [
  {
    name: 'nsfwcheck',
    description: 'Check if an image is NSFW',
    options: [{
      name: 'image',
      type: 11,
      description: 'Image to check',
      required: true
    }]
  },
  {
    name: 'play',
    description: 'Play a YouTube song',
    options: [{
      name: 'query',
      type: 3,
      description: 'YouTube link or keywords',
      required: true
    }]
  },
  {
    name: 'queue',
    description: 'Show the current music queue',
    options: []
  },
  {
    name: 'setmoderation',
    description: 'Enable or disable specific content checks',
    options: [
      {
        name: 'category',
        type: 3,
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
        type: 5,
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
        type: 3,
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
        type: 10,
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
        type: 3,
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
        type: 5,
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
  },
  {
    name: 'reload',
    description: 'Reload the bot configuration (admin only)',
    options: []
  }
];

const config = getConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Register slash commands on startup and resume queues
client.once(Events.ClientReady, async (c) => {
  await reloadConfig();
  const config = getConfig();
  console.log(`Logged in as ${c.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  try {
    if (config.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, config.GUILD_ID),
        { body: commands }
      );
      console.log(`Slash commands registered to guild: ${config.GUILD_ID}`);
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
  // Resume music queues and playback after bot restart
  await resumeAllQueuesOnStartup(client);
  // Start auto-restoring now playing/player controls
  startNowPlayingChecker(client);
});

// Helper to reply and auto-delete after delay
async function replyAndAutoDelete(interaction, msg, delay = 2000) {
  await interaction.reply(
    typeof msg === "string" ? { content: msg } : msg
  );
  const sent = await interaction.fetchReply();
  setTimeout(() => {
    if (sent && sent.deletable) sent.delete().catch(() => {});
  }, delay);
}

// SLASH COMMAND HANDLER with robust interaction error handling
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      try {
        await handleMusicButton(interaction);
      } catch (e) {
        if (e.code !== 10062) console.error('Button interaction error:', e);
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      try {
        await handleMusicMenu(interaction);
      } catch (e) {
        if (e.code !== 10062) console.error('Menu interaction error:', e);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guildId;
    if (!guildId) {
      try {
        await interaction.reply({ content: "Commands must be run in a server.", ephemeral: true });
      } catch (e) {}
      return;
    }
    await loadSettings();

    // --- /reload command ---
    if (interaction.commandName === 'reload') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        try {
          await interaction.reply({ content: "❌ Only admins can reload the configuration.", ephemeral: true });
        } catch (e) {}
        return;
      }
      try {
        await reloadConfig();
        // Use helper for public auto-deleted message
        await replyAndAutoDelete(interaction, "✅ Configuration reloaded!", 2000);
      } catch (err) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "❌ Error reloading configuration: " + err.message });
        } else {
          await interaction.reply({ content: "❌ Error reloading configuration: " + err.message, ephemeral: true });
        }
      }
      return;
    }

    if (interaction.commandName === 'nsfwcheck') {
      try {
        await interaction.deferReply();
        const attachment = interaction.options.getAttachment('image');
        const settings = getGuildSettings(guildId);
        await nsfwCheck(interaction, attachment.url, settings);
      } catch (e) {
        try {
          await interaction.editReply('Something went wrong with nsfwcheck.');
        } catch (e2) {
          if (e2.code !== 10062 && interaction.channel) await interaction.channel.send('Something went wrong with nsfwcheck.');
        }
      }
      return;
    }

    if (interaction.commandName === 'play') {
      try {
        await playCommand(client, interaction);
      } catch (e) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Something went wrong with /play.');
          } else {
            await interaction.reply({ content: "Something went wrong with /play." });
          }
        } catch (e2) {
          if (e2.code !== 10062 && interaction.channel) await interaction.channel.send('Something went wrong with /play.');
        }
      }
      return;
    }

    if (interaction.commandName === 'queue') {
      try {
        await queueCommand(client, interaction);
      } catch (e) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Something went wrong with /queue.');
          } else {
            await interaction.reply({ content: "Something went wrong with /queue.",
        flags: 1 << 6,
       });
          }
        } catch (e2) {
          if (e2.code !== 10062 && interaction.channel) await interaction.channel.send('Something went wrong with /queue.');
        }
      }
      return;
    }

    if (interaction.commandName === 'commands') {
      try {
        await commandsCommand(client, interaction);
      } catch (e) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Something went wrong with /commands.');
          } else {
            await interaction.reply({ content: "Something went wrong with /commands." });
          }
        } catch (e2) {
          if (e2.code !== 10062 && interaction.channel) await interaction.channel.send('Something went wrong with /commands.');
        }
      }
      return;
    }

    // Moderation admin commands
    if (['setmoderation', 'setthreshold', 'setcheck'].includes(interaction.commandName)) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        try {
          await interaction.reply({ content: "Only admins can change moderation settings.", ephemeral: true });
        } catch (e) {}
        return;
      }
    }

    if (interaction.commandName === 'setmoderation') {
      const category = interaction.options.getString('category');
      const enabled = interaction.options.getBoolean('enabled');
      const settings = getGuildSettings(guildId);
      settings.checks[category] = enabled;
      await saveSettings();
      try {
        await interaction.reply(`Moderation for **${category}** set to **${enabled}**.`);
      } catch (e) {}
      return;
    }

    if (interaction.commandName === 'setcheck') {
      const check = interaction.options.getString('check');
      const enabled = interaction.options.getBoolean('enabled');
      const settings = getGuildSettings(guildId);
      if (settings.checks[check] === undefined) {
        try {
          await interaction.reply({ content: `Check key "${check}" does not exist.`, ephemeral: true });
        } catch (e) {}
        return;
      }
      settings.checks[check] = enabled;
      await saveSettings();
      try {
        await interaction.reply(`Check **${check}** set to **${enabled}**.`);
      } catch (e) {}
      return;
    }

    if (interaction.commandName === 'setthreshold') {
      const threshold = interaction.options.getString('threshold');
      const value = interaction.options.getNumber('value');
      if (value < 0 || value > 1) {
        try {
          await interaction.reply({ content: "Threshold value must be between 0 and 1.", ephemeral: true });
        } catch (e) {}
        return;
      }
      const settings = getGuildSettings(guildId);
      settings.thresholds[threshold] = value;
      if (settings.checks[threshold] !== undefined) {
        settings.checks[threshold] = value > 0;
      }
      await saveSettings();
      let msg = `Threshold for **${threshold}** set to **${value}**.`;
      if (value === 0 && settings.checks[threshold] === false) {
        msg += `\n:information_source: Check **${threshold}** has been disabled because threshold is 0.`;
      }
      if (value > 0 && settings.checks[threshold] === true) {
        msg += `\n:information_source: Check **${threshold}** has been enabled because threshold is above 0.`;
      }
      try {
        await interaction.reply(msg);
      } catch (e) {}
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
      try {
        await interaction.reply(msg);
      } catch (e) {}
      return;
    }
  } catch (err) {
    console.error('Unhandled interaction error:', err);
    if (interaction && interaction.channel) {
      try {
        await interaction.channel.send("An unknown error occurred while processing your command.");
      } catch (e2) {}
    }
  }
});

// PREFIX MESSAGE HANDLER FOR !commands and NSFW auto check
client.on('messageCreate', async message => {
  if (message.author.bot) return;

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

  if (message.attachments.size > 0) {
    const imageAttachments = message.attachments.filter(att => att.contentType && att.contentType.startsWith('image/'));
    if (imageAttachments.size === 0) return;

    const guildId = message.guildId;
    if (!guildId) return;

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

// Always use getConfig() for the latest settings!
client.login(getConfig().DISCORD_TOKEN);