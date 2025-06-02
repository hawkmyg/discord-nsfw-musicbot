import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  AudioPlayerStatus,
} from "@discordjs/voice";
import ytdl from "@distube/ytdl-core";
import play from "play-dl";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import { getConfig, reloadConfig } from "./config.js";
import { saveQueueState, loadQueueState } from "./persistent-queue.js";

// --- Regex ---
const ytVideoRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
const ytPlaylistRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.*(list=)([\w-]+)/;

// --- Guild-specific maps ---
const queue = new Map();
const players = new Map();
const nowPlayingMsg = new Map(); // guildId => { messageId, channelId }
const volumes = new Map();
const pausedStates = new Map();
const lastVoiceChannel = new Map();

// --- PERSISTENCE: Load state at startup ---
const savedQueues = loadQueueState();
for (const [guildId, data] of Object.entries(savedQueues)) {
  if (data.queue) queue.set(guildId, data.queue);
  if (data.volumes !== undefined) volumes.set(guildId, data.volumes);
  if (data.pausedStates !== undefined) pausedStates.set(guildId, data.pausedStates);
  if (data.lastVoiceChannelId) lastVoiceChannel.set(guildId, data.lastVoiceChannelId);
}

function persistAllQueues() {
  const state = {};
  for (const [guildId, q] of queue.entries()) {
    state[guildId] = {
      queue: q,
      volumes: volumes.get(guildId) ?? 1.0,
      pausedStates: pausedStates.get(guildId) ?? false,
      lastVoiceChannelId: lastVoiceChannel.get(guildId) ?? null,
    };
  }
  saveQueueState(state);
}

async function sendAndAutoDelete(interaction, msg, delay = 2000) {
  const sent = await interaction.channel.send(msg);
  setTimeout(() => sent.delete().catch(() => {}), delay);
}

function extractYouTubeId(url) {
  const regex = /(?:youtube\.com.*(?:\?|&)v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export async function playCommand(client, interaction) {
  try {
    const config = getConfig();
    const MUSIC_ROOM_VOICE_ID = config.MUSIC_ROOM_VOICE_ID || "";
    const REQUEST_TEXT_CHANNEL_ID = config.REQUEST_TEXT_CHANNEL_ID || "";

    // --- TEXT CHANNEL ENFORCEMENT ---
    if (
      REQUEST_TEXT_CHANNEL_ID &&
      interaction.channelId !== REQUEST_TEXT_CHANNEL_ID
    ) {
      return interaction.reply({
        content: `❌ Use this command in <#${REQUEST_TEXT_CHANNEL_ID}> only.`,
        ephemeral: true,
      });
    }

    // --- VOICE CHANNEL ENFORCEMENT ---
    let voiceChannel;
    if (MUSIC_ROOM_VOICE_ID) {
      voiceChannel = interaction.guild.channels.cache.get(MUSIC_ROOM_VOICE_ID);
      if (!voiceChannel)
        return interaction.reply({
          content: `❌ Music room not found!`,
          ephemeral: true,
        });

      if (
        !interaction.member.voice.channel ||
        interaction.member.voice.channel.id !== MUSIC_ROOM_VOICE_ID
      ) {
        return interaction.reply({
          content: `❌ Join the music room <#${MUSIC_ROOM_VOICE_ID}> to request songs.`,
          ephemeral: true,
        });
      }
    } else {
      voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel)
        return interaction.reply({
          content: "Join a voice channel first!",
          ephemeral: true,
        });
    }

    // --- QUERY VALIDATION ---
    const query = interaction.options.getString("query");
    if (!query || typeof query !== "string" || !query.trim()) {
      return interaction.reply({
        content: "You must provide a valid YouTube link or search keywords.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // --- SONG SEARCH/QUEUE ---
    let songs = [];

    try {
      // Playlist: add up to 50 tracks
      if (
        ytPlaylistRegex.test(query) ||
        (await play.yt_validate(query)) === "playlist"
      ) {
        const playlist = await play.playlist_info(query, { incomplete: true });
        const videos = await playlist.all_videos();
        const videoList = videos.slice(0, 50);
        songs = videoList.map((video) => ({
          url: video.url,
          title: video.title,
          requestedBy: interaction.user.username,
        }));
        await sendAndAutoDelete(interaction, {
          content: `Queued playlist: **${playlist.title}** with ${songs.length} songs. (Requested by: **${interaction.user.username}**)`,
        });
      } else {
        // Single video or search
        let yt_url = query;
        let yt_title = null;
        if (!ytVideoRegex.test(query)) {
          const searchResults = await play.search(query, { limit: 1 });
          if (
            !searchResults ||
            !searchResults[0] ||
            !searchResults[0].url
          ) {
            throw new Error("No results found for your query.");
          }
          yt_url = searchResults[0].url;
        }
        try {
          const info = await ytdl.getBasicInfo(yt_url);
          yt_title = info.videoDetails.title;
          yt_url = info.videoDetails.video_url;
        } catch (e) {
          const info = await play.video_basic_info(yt_url);
          yt_title = info.video_details.title;
          yt_url = info.video_details.url;
        }
        songs = [
          {
            url: yt_url,
            title: yt_title,
            requestedBy: interaction.user.username,
          },
        ];
        await sendAndAutoDelete(interaction, {
          content: `Queued: **${yt_title}** (Requested by: **${interaction.user.username}**)`,
          components: [
            musicButtons(volumes.get(interaction.guildId) ?? 1.0, false),
            musicMenu(songs),
          ],
        });
      }
    } catch (e) {
      await interaction.editReply("Failed to fetch YouTube info: " + e.message);
      return;
    }

    // --- QUEUE MANAGEMENT ---
    const guildId = interaction.guildId;
    if (!queue.has(guildId)) queue.set(guildId, []);
    queue.get(guildId).push(...songs);

    // Persist the voice channel for resume
    lastVoiceChannel.set(guildId, voiceChannel.id);

    // --- PERSIST QUEUE ---
    persistAllQueues();

    // --- START PLAYBACK IF NOT ALREADY ACTIVE ---
    if (
      !players.has(guildId) ||
      players.get(guildId)._state.status === AudioPlayerStatus.Idle
    ) {
      pausedStates.set(guildId, false);
      await playNext(client, { channel: interaction.channel }, guildId, voiceChannel);
    }

    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 2200);
  } catch (e) {
    console.error("playCommand error:", e);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Fatal error in /play: " + e.message);
    } else {
      await interaction.reply({
        content: "Fatal error in /play: " + e.message,
        ephemeral: true,
      });
    }
  }
}

function queuePaginationRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("queue_prev")
      .setLabel("⬅️ Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue_next")
      .setLabel("Next ➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

function buildQueueMessage(q, page, itemsPerPage) {
  const totalPages = Math.max(1, Math.ceil(q.length / itemsPerPage));
  const start = page * itemsPerPage;
  const end = Math.min(start + itemsPerPage, q.length);
  let msg = `🎶 **Music Queue (Page ${page + 1}/${totalPages}):**\n`;
  q.slice(start, end).forEach((song, i) => {
    msg += `**#${start + i + 1}:** ${song.title} _(requested by ${song.requestedBy})_\n`;
  });
  if (msg.length > 1990) msg = msg.slice(0, 1990) + "\n...(truncated)";
  return msg;
}

export async function queueCommand(client, interaction) {
  const guildId = interaction.guildId;
  const q = queue.get(guildId) || [];
  if (!q || q.length === 0) {
    return interaction.reply({
      content: "The queue is empty.",
      ephemeral: true,
    });
  }

  const itemsPerPage = 10;
  let page = 0;
  const totalPages = Math.ceil(q.length / itemsPerPage);

  try {
    await interaction.reply({
      content: buildQueueMessage(q, page, itemsPerPage),
      components: [queuePaginationRow(page, totalPages), musicMenu(q)],
    });
  } catch (e) {
    console.error('[queueCommand] Error at reply:', e);
    throw e;
  }

  const filter = (btn) =>
    btn.user.id === interaction.user.id &&
    ["queue_prev", "queue_next"].includes(btn.customId);

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: 60_000,
  });

  collector.on("collect", async (btn) => {
    await btn.deferUpdate().catch(() => {});
    if (btn.customId === "queue_prev" && page > 0) page--;
    if (btn.customId === "queue_next" && page < totalPages - 1) page++;
    try {
      await interaction.editReply({
        content: buildQueueMessage(q, page, itemsPerPage),
        components: [queuePaginationRow(page, totalPages), musicMenu(q)],
      });
    } catch (err) {
      console.error("[queueCommand] Error at editReply:", err);
    }
  });
}

export async function commandsCommand(client, interaction) {
  const commandsList = [
    {
      name: "/play <YouTube link or keywords>",
      desc: "Play or queue a YouTube song by link, search, or playlist.",
    },
    {
      name: "/queue",
      desc: "Show the current music queue.",
    },
    {
      name: "/commands",
      desc: "Show this list of bot commands.",
    },
    {
      name: "Pause/Resume/Skip/Stop",
      desc: "Use the buttons below the music message to control playback.",
    },
    {
      name: "Song Selection Menu",
      desc: "Use the dropdown under the music message to view/select tracks.",
    },
    {
      name: "Volume Buttons",
      desc: "Use the speaker buttons to lower/increase music volume.",
    },
  ];

  await interaction.reply({
    content:
      "**Available Music Bot Commands:**\n\n" +
      commandsList
        .map((cmd) => `• **${cmd.name}**\n  ${cmd.desc}`)
        .join("\n\n"),
    ephemeral: true,
  });
}

export function musicButtons(volume = 1.0, paused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pause_resume")
      .setEmoji(paused ? "▶️" : "⏸️")
      .setLabel(paused ? "Resume" : "Pause")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji("🛑")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("volume_down")
      .setEmoji("🔉")
      .setLabel("Vol-")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("volume_up")
      .setEmoji("🔊")
      .setLabel("Vol+")
      .setStyle(ButtonStyle.Success)
  );
}

export function musicMenu(q) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_song")
      .setPlaceholder("Queue")
      .addOptions(
        q.slice(0, 25).map((track, i) => ({
          label: `${i + 1}. ${track.title}`.slice(0, 100),
          value: String(i),
        }))
      )
  );
}

async function playNext(client, context, guildId, voice) {
  const q = queue.get(guildId);
  if (!q || q.length === 0) {
    // Remove now playing message if exists
    if (nowPlayingMsg.has(guildId)) {
      const { messageId, channelId } = nowPlayingMsg.get(guildId);
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          try {
            const msg = await channel.messages.fetch(messageId);
            if (msg && msg.deletable) await msg.delete().catch(() => {});
          } catch (e) {}
        }
      }
      nowPlayingMsg.delete(guildId);
    }
    players.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    pausedStates.set(guildId, false);
    persistAllQueues();
    return;
  }

  const track = q[0];

  if (
    !track.url ||
    typeof track.url !== "string" ||
    (!ytVideoRegex.test(track.url) && !ytPlaylistRegex.test(track.url))
  ) {
    if (context && context.channel) {
      await context.channel.send({
        content: `Track "${track.title || "Unknown"}" has an invalid or unsupported URL and will be skipped. URL: ${track.url}`,
      });
    }
    q.shift();
    persistAllQueues();
    return playNext(client, context, guildId, voice);
  }

  let resource;
  try {
    let ytStream = ytdl(track.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25,
    });
    resource = createAudioResource(ytStream, {
      inputType: "arbitrary",
      inlineVolume: true,
    });
  } catch (e1) {
    try {
      const { stream } = await play.video_stream(track.url);
      resource = createAudioResource(stream, {
        inputType: "arbitrary",
        inlineVolume: true,
      });
    } catch (e2) {
      if (context && context.channel) {
        await context.channel.send({
          content: `Failed to stream "${track.title}":\n- ytdl-core error: ${e1.message}\n- play-dl error: ${e2.message}`,
        });
      }
      q.shift();
      persistAllQueues();
      return playNext(client, context, guildId, voice);
    }
  }

  const currentVolume = volumes.get(guildId) ?? 1.0;
  if (resource.volume) resource.volume.setVolume(currentVolume);

  let connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voice.id,
      guildId,
      adapterCreator: voice.guild.voiceAdapterCreator,
    });
    connection.on("stateChange", (oldState, newState) => {
      console.log(
        `[VoiceConnection] ${oldState.status} -> ${newState.status}`
      );
    });
  }

  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
    player.on("stateChange", (oldState, newState) => {});
    player.on("error", (error) => {
      console.error("[AudioPlayer Error]:", error);
      queue.get(guildId)?.shift();
      persistAllQueues();
      playNext(client, context, guildId, voice);
    });
    player.on(AudioPlayerStatus.Idle, () => {
      queue.get(guildId)?.shift();
      persistAllQueues();
      playNext(client, context, guildId, voice);
    });
  }

  connection.subscribe(player);
  player.play(resource);
  pausedStates.set(guildId, false);
  persistAllQueues();

  let channel = null;
  if (context && context.channel) {
    channel = context.channel;
  } else if (nowPlayingMsg.has(guildId)) {
    const { channelId } = nowPlayingMsg.get(guildId);
    if (channelId) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) channel = guild.channels.cache.get(channelId);
    }
  }
  if (!channel && client.guilds.cache.has(guildId)) {
    const guild = client.guilds.cache.get(guildId);
    channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0);
  }
  // Remove previous now playing message if exists
  if (nowPlayingMsg.has(guildId)) {
    const { messageId, channelId } = nowPlayingMsg.get(guildId);
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const oldChan = guild.channels.cache.get(channelId);
      if (oldChan) {
        try {
          const oldMsg = await oldChan.messages.fetch(messageId);
          if (oldMsg && oldMsg.deletable) await oldMsg.delete().catch(() => {});
        } catch (e) {}
      }
    }
    nowPlayingMsg.delete(guildId);
  }
  if (channel) {
    const videoId = extractYouTubeId(track.url);
    const thumbnailUrl = videoId
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : null;

    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle("🎶 Now Playing")
      .setDescription(
        `**${track.title}**\nRequested by: **${track.requestedBy}**\n\n**Volume:** ${Math.round(
          currentVolume * 100
        )}%`
      )
      .setURL(track.url);

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    const sentMsg = await channel.send({
      embeds: [embed],
      components: [musicButtons(currentVolume, false)],
    });
    // Save only IDs
    nowPlayingMsg.set(guildId, {
      messageId: sentMsg.id,
      channelId: channel.id,
    });
  }
}

// --------- AUTO RESTORE NOW PLAYING CONTROLS IF DELETED ---------
async function checkNowPlayingMessages(client) {
  // For every guild with a non-empty queue, ensure a now playing message exists.
  for (const [guildId, q] of queue.entries()) {
    if (!q || q.length === 0) continue;
    let channel, messageExists = false;

    // Try to get the channel and message from nowPlayingMsg map
    let channelId = null, messageId = null;
    if (nowPlayingMsg.has(guildId)) {
      ({ channelId, messageId } = nowPlayingMsg.get(guildId));
    }
    // Try to fetch the message if we have an ID
    if (channelId && messageId) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        channel = guild.channels.cache.get(channelId);
        if (channel) {
          try {
            await channel.messages.fetch(messageId);
            messageExists = true;
          } catch (e) {
            messageExists = false;
          }
        }
      }
    } else {
      // No record, try to pick a default text channel
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0);
      }
    }

    if (!messageExists && channel) {
      // Post the embed and controls
      const track = q[0];
      const currentVolume = volumes.get(guildId) ?? 1.0;
      const paused = pausedStates.get(guildId) ?? false;
      const videoId = extractYouTubeId(track.url);
      const thumbnailUrl = videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : null;
      const embed = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("🎶 Now Playing")
        .setDescription(
          `**${track.title}**\nRequested by: **${track.requestedBy}**\n\n**Volume:** ${Math.round(
            currentVolume * 100
          )}%`
        )
        .setURL(track.url);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

      try {
        const sentMsg = await channel.send({
          embeds: [embed],
          components: [musicButtons(currentVolume, paused)],
        });
        nowPlayingMsg.set(guildId, {
          messageId: sentMsg.id,
          channelId: channel.id,
        });
      } catch (err) {
        console.error("Failed to (re-)post now playing:", err);
      }
    }
  }
}

// Call this on bot ready:
export function startNowPlayingChecker(client) {
  setInterval(() => checkNowPlayingMessages(client), 30000);
}

// ---------------------------------------------------------------

export async function handleMusicButton(interaction) {
  const guildId = interaction.guildId;
  const player = players.get(guildId);
  let currentVol = volumes.get(guildId) ?? 1.0;
  let didChangeVol = false;
  let wasPaused = pausedStates.get(guildId) ?? false;

  if (!player)
    return interaction.reply({
      content: "Nothing is playing.",
      ephemeral: true,
    });

  try {
    await interaction.deferUpdate();
  } catch (e) {
    if (e.code === 10062) return;
    throw e;
  }

  let channel = interaction.channel;

  if (interaction.customId === "pause_resume") {
    if (!wasPaused) {
      player.pause();
      pausedStates.set(guildId, true);
      await sendAndAutoDelete(interaction, { content: "Paused." });
    } else {
      player.unpause();
      pausedStates.set(guildId, false);
      await sendAndAutoDelete(interaction, { content: "Resumed." });
    }
    persistAllQueues();
  }
  if (interaction.customId === "skip") {
    queue.get(guildId)?.shift();
    player.stop();
    await playNext(interaction.client, { channel }, guildId, interaction.member.voice.channel ?? channel);
    await sendAndAutoDelete(interaction, { content: "Skipped." });
    persistAllQueues();
    return;
  }
  if (interaction.customId === "stop") {
    queue.set(guildId, []);
    player.stop();
    getVoiceConnection(guildId)?.destroy();
    players.delete(guildId);
    pausedStates.set(guildId, false);
    // Remove now playing message if exists
    if (nowPlayingMsg.has(guildId)) {
      const { messageId, channelId } = nowPlayingMsg.get(guildId);
      const guild = interaction.client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          try {
            const msg = await channel.messages.fetch(messageId);
            if (msg && msg.deletable) await msg.delete().catch(() => {});
          } catch (e) {}
        }
      }
      nowPlayingMsg.delete(guildId);
    }
    await sendAndAutoDelete(interaction, { content: "Stopped and disconnected." });
    persistAllQueues();
  }
  if (interaction.customId === "volume_down") {
    currentVol = Math.max(0.05, currentVol - 0.1);
    volumes.set(guildId, currentVol);
    const resource = player.state.resource;
    if (resource && resource.volume) {
      resource.volume.setVolume(currentVol);
      didChangeVol = true;
    }
    await sendAndAutoDelete(interaction, {
      content: `Volume: ${Math.round(currentVol * 100)}%`,
    });
    persistAllQueues();
  }
  if (interaction.customId === "volume_up") {
    currentVol = Math.min(2.0, currentVol + 0.1);
    volumes.set(guildId, currentVol);
    const resource = player.state.resource;
    if (resource && resource.volume) {
      resource.volume.setVolume(currentVol);
      didChangeVol = true;
    }
    await sendAndAutoDelete(interaction, {
      content: `Volume: ${Math.round(currentVol * 100)}%`,
    });
    persistAllQueues();
  }

  if (
    (didChangeVol || interaction.customId === "pause_resume") &&
    nowPlayingMsg.has(guildId)
  ) {
    const { messageId, channelId } = nowPlayingMsg.get(guildId);
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.edit({
        components: [
          musicButtons(currentVol, pausedStates.get(guildId) ?? false),
        ],
      });
      if (didChangeVol) {
        const embed = msg.embeds[0]
          ? EmbedBuilder.from(msg.embeds[0])
          : new EmbedBuilder().setTitle("🎶 Now Playing");
        if (embed.data && embed.data.description) {
          embed.setDescription(
            embed.data.description.replace(
              /(\*\*Volume:\*\* )(\d+)%/,
              `**Volume:** ${Math.round(currentVol * 100)}%`
            )
          );
          await msg.edit({ embeds: [embed] });
        }
      }
    } catch (e) {}
  }
}

export async function handleMusicMenu(interaction) {
  const guildId = interaction.guildId;
  const selected = interaction.values[0];
  const q = queue.get(guildId);

  if (!q || q.length === 0) {
    return interaction.reply({ content: "Queue empty.", ephemeral: true });
  }

  const idx = Number(selected);
  if (isNaN(idx) || idx < 0 || idx >= q.length) {
    return interaction.reply({ content: "Invalid selection.", ephemeral: true });
  }

  const track = q[idx];
  if (!track) {
    return interaction.reply({ content: "Track not found.", ephemeral: true });
  }

  await interaction.reply({
    content: `Selected: **${track.title}** (requested by ${track.requestedBy})`,
    ephemeral: true,
  });
}

export async function handleReloadCommand(client, interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has("Administrator")) {
    await interaction.reply({
      content: "❌ Only admins can reload the configuration.",
      ephemeral: true
    });
    return;
  }
  try {
    await reloadConfig();
    const confirmation = await interaction.reply({
      content: "✅ Configuration reloaded!",
      fetchReply: true
    });
    setTimeout(() => {
      if (confirmation && confirmation.deletable) {
        confirmation.delete().catch((e) => console.error("Delete error:", e));
      }
    }, 2000);
  } catch (err) {
    await interaction.reply({
      content: "❌ Error reloading configuration: " + err.message,
      ephemeral: true
    });
  }
}

export async function resumeAllQueuesOnStartup(client) {
  for (const [guildId, q] of queue.entries()) {
    if (q && q.length > 0 && lastVoiceChannel.has(guildId)) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const channelId = lastVoiceChannel.get(guildId);
      let textChannel = null;
      textChannel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0);
      const voice = guild.channels.cache.get(channelId);
      if (!voice || (voice.type !== 2 && voice.type !== "GUILD_VOICE")) continue;
      await playNext(client, { channel: textChannel }, guildId, voice);
    }
  }
}

// ---- MAIN INTERACTION DISPATCH ----

export async function onInteractionCreate(client, interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "play") {
    return playCommand(client, interaction);
  }
  if (interaction.commandName === "queue") {
    return queueCommand(client, interaction);
  }
  if (interaction.commandName === "commands") {
    return commandsCommand(client, interaction);
  }
  // ...add other command handlers as needed
}