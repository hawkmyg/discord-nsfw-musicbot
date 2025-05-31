import { 
  joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, AudioPlayerStatus 
} from '@discordjs/voice';
import play from 'play-dl';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

// Set your YouTube cookie here for best compatibility (see play-dl docs)
play.setToken({
  youtube: {
    cookie: 'VISITOR_INFO1_LIVE=srHo6Q9THmc; VISITOR_PRIVACY_METADATA=CgJVUxIEGgAgFw%3D%3D; PREF=tz=America.New_York&f6=40000000&f7=10140&f5=30000; LOGIN_INFO=AFmmF2swRAIgG1nWFnUQ3esGfJe8S0MBa1FnpbzCQh6nbTHPuW4Y_H4CIFXdzm6V8CaGW_pmqZbHcH17ZNJkhjoy1xxSJKAB4BgJ:QUQ3MjNmd0FfX2QtYmI5V1U1dE1NTFp4RWFnQjRMOFVjVjhsbGEwSXRsZkNvdWlVNUhXRUJpZFhFUWp2UUtGTjRPMThYY1FLTEx3dlU2NkdXSlh3QTRUeWQyUFhpT3czTjdLWDVUZkRUZzZPU19LbURBdE5pV2FPZTZPbGo2VWhHcEVoQjFYc3FWSnZhZTdBT0NPUnZ3T0pLcXFmTmFGc2xKTmpUclRfMG92bzVURHhBSTlBNUtkN05mSXZDQ1pPZkRDSEpQODZ2VHFtTk02bm9qaE0xVTM3TERKRlJ1b0ZSZw==; SID=g.a000xgiqVb6bq1-1O5t1kP9ccAhPRBTJTw5KI1MZio0GayoqEC_QVI9DlgmeOB5uybWceFifUQACgYKAZUSARASFQHGX2Mi24yBAo1mtN01AdB_ViGwWhoVAUF8yKoCYpgnOqCODox5lLKKp5NX0076; __Secure-1PSID=g.a000xgiqVb6bq1-1O5t1kP9ccAhPRBTJTw5KI1MZio0GayoqEC_QTvircnfRWDfqGTVm1PHwOgACgYKAVwSARASFQHGX2MiSgpt-getwSB6S2jXVRubLBoVAUF8yKps-Gj_TX8A3WXNvhVm3aCl0076; __Secure-3PSID=g.a000xgiqVb6bq1-1O5t1kP9ccAhPRBTJTw5KI1MZio0GayoqEC_Qj4HDZBo1QTO9yV3pYdgXTAACgYKAe8SARASFQHGX2Mi5GMYBHnGwW07eh-JJmq6zRoVAUF8yKrH5AOXnoHmQvk4vGi55TzV0076; HSID=ALIxi1vId9mzxdk7e; SSID=AQlDVGZ53Dk6F8khd; APISID=mbVtYD-aUEu3joXi/AC9NkK8vX83UQxg5W; SAPISID=39WBDgVaTs6Hdr3Q/Ac-TwQzg5wUzkVLJm; __Secure-1PAPISID=39WBDgVaTs6Hdr3Q/Ac-TwQzg5wUzkVLJm; __Secure-3PAPISID=39WBDgVaTs6Hdr3Q/Ac-TwQzg5wUzkVLJm; YSC=eCiqZow4cKM; __Secure-ROLLOUT_TOKEN=CO6Olr6z-dDQbhCR5MvllbmNAxjqx7_n4cuNAw%3D%3D; wide=1; __Secure-1PSIDTS=sidts-CjIB5H03PyZYtF02PohhekmXAA5nTzpmfL6ThWWJB3WE_xxB6I_7bDJ4uPaRdGuMy3-WahAA; __Secure-3PSIDTS=sidts-CjIB5H03PyZYtF02PohhekmXAA5nTzpmfL6ThWWJB3WE_xxB6I_7bDJ4uPaRdGuMy3-WahAA; SIDCC=AKEyXzXjZc_grk3q75_Ey6n-2dNV_imBBEijdkZj2QuwT-rcWV7osLqVaxcRcQA87JVk5QDDFY0; __Secure-1PSIDCC=AKEyXzW0GPQMDJNGycKFzrvHwnh4qw26lCUSE5lpSw_ffFBO1DWBIvVMXq4gsgqJRQOdxr3cCg; __Secure-3PSIDCC=AKEyXzW8M6L1CP2dI9K6CXcIsb59-4_26YSqtZdDitrlEU3FTc1_T515Sd8aQu-59K6DSFgeGOg'
  }
});

const queue = new Map(); // guildId -> [ {url, title, requestedBy} ]
const players = new Map(); // guildId -> audioPlayer

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

  if (!players.has(guildId)) {
    playNext(interaction, guildId, voice);
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

// Strong YouTube URL validation regex
const ytRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;

async function playNext(interaction, guildId, voice) {
  const q = queue.get(guildId);
  if (!q || q.length === 0) {
    players.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    return;
  }

  const track = q[0];

  // Debug log
  console.log("About to play:", track);

  if (
    !track.url ||
    typeof track.url !== "string" ||
    !ytRegex.test(track.url)
  ) {
    await interaction.followUp({
      content: `Track "${track.title || "Unknown"}" has an invalid or unsupported URL and will be skipped. URL: ${track.url}`,
      flags: 1 << 6
    });
    q.shift();
    return playNext(interaction, guildId, voice);
  }

  let stream;
  try {
    stream = await play.stream(track.url, { discordPlayerCompatibility: true });
    if (!stream || !stream.stream) {
      throw new Error('play-dl returned empty stream');
    }
  } catch (e) {
    await interaction.followUp({ content: `Failed to stream **${track.title}**: ${e.message}\nURL: ${track.url}`, flags: 1 << 6 });
    q.shift();
    return playNext(interaction, guildId, voice);
  }

  const resource = createAudioResource(stream.stream, { inputType: stream.type });

  let connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voice.id,
      guildId,
      adapterCreator: voice.guild.voiceAdapterCreator
    });
  }

  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
  }

  connection.subscribe(player);
  player.play(resource);

  player.on('stateChange', (oldState, newState) => {
    console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
  });

  player.once(AudioPlayerStatus.Idle, () => {
    q.shift();
    playNext(interaction, guildId, voice);
  });

  player.on('error', error => {
    interaction.followUp({ content: `Playback error: ${error.message}`, flags: 1 << 6 }).catch(() => {});
    q.shift();
    playNext(interaction, guildId, voice);
  });
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