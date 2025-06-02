import { Client, GatewayIntentBits, Partials, REST, Routes, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events } from 'discord.js';
import { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import dotenv from 'dotenv';
import nsfwCheck from './nsfw.js';
import { playCommand, musicButtons, musicMenu, handleMusicButton, handleMusicMenu } from './music.js';

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
  }
];

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  // Register commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id), 
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (e) {
    console.error('Slash command registration error:', e);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'nsfwcheck') {
      const attachment = interaction.options.getAttachment('image');
      await nsfwCheck(interaction, attachment.url);
    }
    if (interaction.commandName === 'play') {
      await playCommand(client, interaction);
    }
  } else if (interaction.isButton()) {
    await handleMusicButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    await handleMusicMenu(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);