import { 
  joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, AudioPlayerStatus 
} from '@discordjs/voice';
import play from 'play-dl';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

// Optional: Uncomment and set your YouTube cookie if needed for region/age restrictions
// play.setToken({ youtube: { cookie: 'YOUR_COOKIE_HERE' } });

const queue = new Map(); // guildId -> [ {url, title, requestedBy} ]
const players = new Map(); // guildId -> audioPlayer

// Regex for strong YouTube URL validation
const ytRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;

export async function playCommand(client, interaction) {
  const query = interaction.options.getString('query');
  const voice = interaction.member.voice.channel;
  if (!voice) return interaction.reply({ content: "Join a voice channel first!", flags: 1 << 6 });

  if (!query || typeof query !== 'string' || !query.trim()) {
    return interaction.reply({ content: 'You must provide a valid YouTube link or search keywords.', flags: 1 << 6 });
  }

  await interaction.deferReply();

  let yt_info;
  try {
    if (play.yt_validate(query) === 'video') {
      yt_info = await play.video_basic_info(query);
    } else {
      const searchResults = await play.search(query, { limit: 1 });
      if (!searchResults || !searchResults[0] || !searchResults[0].url) {
        throw new Error('No results found for your query.');
      }
      yt_info = await play.video_basic_info(searchResults[0].url);
    }
    if (!yt_info || !yt_info.video_details || !yt_info.video_details.url) throw new Error('Could not retrieve video details.');
    if (!ytRegex.test(yt_info.video_details.url)) throw new Error('YouTube URL is invalid.');
  } catch (e) {
    return interaction.editReply('Failed to fetch YouTube info: ' + e.message);
  }

  const guildId = interaction.guildId;
  if (!queue.has(guildId)) queue.set(guildId, []);
  queue.get(guildId).push({
    url: yt_info.video_details.url,
    title: yt_info.video_details.title,
    requestedBy: interaction.user.username
  });

  await interaction.editReply({
    content: `Queued: **${yt_info.video_details.title}**`,
    components: [musicButtons(), musicMenu(queue.get(guildId))]
  });

  // Only start playback if not already playing
  if (!players.has(guildId) || players.get(guildId)._state.status === AudioPlayerStatus.Idle) {
    await playNext(interaction, guildId, voice);
  }
}

export async function queueCommand(client, interaction) {
  const guildId = interaction.guildId;
  const q = queue.get(guildId);

  if (!q || q.length === 0) {
    return interaction.reply({ content: "The queue is empty.", flags: 1 << 6 });
  }

  const queueList = q
    .map((track, i) => `${i === 0 ? '**Now Playing:**' : `**#${i}:**`} ${track.title} _(requested by ${track.requestedBy})_`)
    .join('\n');

  await interaction.reply({
    content: `🎶 **Music Queue:**\n${queueList}`,
    flags: 0 // not ephemeral, visible to all
  });
}

export function musicButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pause').setLabel('⏸ Pause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('resume').setLabel('▶️ Resume').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stop').setLabel('⏹ Stop').setStyle(ButtonStyle.Danger)
  );
}

export function musicMenu(q) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_song')
      .setPlaceholder('Queue')
      .addOptions(q.map((track, i) => ({
        label: `${i+1}. ${track.title}`,
        value: String(i)
      })))
  );
}

async function playNext(interaction, guildId, voice) {
  const q = queue.get(guildId);
  if (!q || q.length === 0) {
    players.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    return;
  }

  const track = q[0];
  console.log("About to play:", JSON.stringify(track));

  // Validate the URL before streaming
  if (!track.url || typeof track.url !== "string" || !ytRegex.test(track.url)) {
    await interaction.followUp({
      content: `Track "${track.title || "Unknown"}" has an invalid or unsupported URL and will be skipped. URL: ${track.url}`,
      flags: 1 << 6
    });
    q.shift();
    return playNext(interaction, guildId, voice);
  }

  let stream;
  try {
    stream = await play.stream(track.url, { quality: 2 });
    if (!stream || !stream.stream) {
      throw new Error('play-dl returned empty stream');
    }
    console.log('stream.type:', stream.type);
  } catch (e) {
    await interaction.followUp({ content: `Failed to stream: ${e.message}` });
    q.shift();
    return playNext(interaction, guildId, voice);
  }

  const resource = createAudioResource(stream.stream, { inputType: 'opus' });

  let connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voice.id,
      guildId,
      adapterCreator: voice.guild.voiceAdapterCreator
    });
    connection.on('stateChange', (oldState, newState) => {
      console.log(`[VoiceConnection] ${oldState.status} -> ${newState.status}`);
    });
  }

  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
    player.on('stateChange', (oldState, newState) => {
      console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
    });
    player.on('error', error => {
      console.error('[AudioPlayer Error]:', error);
      queue.get(guildId)?.shift();
      playNext(interaction, guildId, voice);
    });
    player.on(AudioPlayerStatus.Idle, () => {
      queue.get(guildId)?.shift();
      playNext(interaction, guildId, voice);
    });
  }

  connection.subscribe(player);
  player.play(resource);
}

export async function handleMusicButton(interaction) {
  const guildId = interaction.guildId;
  const player = players.get(guildId);
  if (!player) return interaction.reply({ content: 'Nothing is playing.', flags: 1 << 6 });

  if (interaction.customId === 'pause') {
    player.pause();
    await interaction.reply({ content: 'Paused.', flags: 1 << 6 });
  }
  if (interaction.customId === 'resume') {
    player.unpause();
    await interaction.reply({ content: 'Resumed.', flags: 1 << 6 });
  }
  if (interaction.customId === 'skip') {
    queue.get(guildId)?.shift();
    player.stop();
    await interaction.reply({ content: 'Skipped.', flags: 1 << 6 });
  }
  if (interaction.customId === 'stop') {
    queue.set(guildId, []);
    player.stop();
    getVoiceConnection(guildId)?.destroy();
    players.delete(guildId);
    await interaction.reply({ content: 'Stopped and disconnected.', flags: 1 << 6 });
  }
}

export async function handleMusicMenu(interaction) {
  const guildId = interaction.guildId;
  const selected = interaction.values[0];
  const q = queue.get(guildId);

  if (!q || q.length === 0) {
    return interaction.reply({ content: 'Queue empty.', flags: 1 << 6 });
  }

  const idx = Number(selected);
  if (isNaN(idx) || idx < 0 || idx >= q.length) {
    return interaction.reply({ content: 'Invalid selection.', flags: 1 << 6 });
  }

  const track = q[idx];
  if (!track) {
    return interaction.reply({ content: 'Track not found.', flags: 1 << 6 });
  }

  await interaction.reply({ content: `Selected: **${track.title}** (requested by ${track.requestedBy})`, flags: 1 << 6 });
}
