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

// Strong YouTube URL validation regex (video or playlist)
const ytVideoRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
const ytPlaylistRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.*(list=)([\w-]+)/;

const queue = new Map(); // guildId -> [ {url, title, requestedBy} ]
const players = new Map(); // guildId -> audioPlayer
const nowPlayingMsg = new Map(); // guildId -> { message, channelId }
const volumes = new Map(); // guildId -> currentVolume (0.0 - 2.0), default 1.0
const pausedStates = new Map(); // guildId -> boolean

// Helper for auto-deleting public status messages (volume, queued, skipped, stopped)
async function sendAndAutoDelete(interaction, msg, delay = 2000) {
  const sent = await interaction.channel.send(msg);
  setTimeout(() => sent.delete().catch(() => {}), delay);
}

export async function playCommand(client, interaction) {
  const query = interaction.options.getString("query");
  const voice = interaction.member.voice.channel;
  if (!voice)
    return interaction.reply({
      content: "Join a voice channel first!",
      flags: 1 << 6 });

  if (!query || typeof query !== "string" || !query.trim()) {
    return interaction.reply({
      content: "You must provide a valid YouTube link or search keywords.",
      flags: 1 << 6 });
  }

  await interaction.deferReply();

  let songs = [];

  try {
    // If playlist URL, handle playlist
    if (ytPlaylistRegex.test(query) || play.yt_validate(query) === "playlist") {
      const playlist = await play.playlist_info(query, { incomplete: true });
      const videos = await playlist.all_videos();
      // Optionally limit number of songs to 50 for sanity
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
      // Not a playlist: treat as single video or search
      let yt_url = query;
      let yt_title = null;
      if (!ytVideoRegex.test(query)) {
        // Use play-dl to search by keywords
        const searchResults = await play.search(query, { limit: 1 });
        if (!searchResults || !searchResults[0] || !searchResults[0].url) {
          throw new Error("No results found for your query.");
        }
        yt_url = searchResults[0].url;
      }
      // Validate with ytdl-core or fallback to play-dl
      try {
        const info = await ytdl.getBasicInfo(yt_url);
        yt_title = info.videoDetails.title;
        yt_url = info.videoDetails.video_url;
      } catch (e) {
        // Fallback: Use play-dl to fetch the title if ytdl-core fails
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
        components: [musicButtons(volumes.get(interaction.guildId) ?? 1.0, false), musicMenu(songs)],
      });
    }
  } catch (e) {
    await interaction.editReply("Failed to fetch YouTube info: " + e.message);
    return;
  }

  const guildId = interaction.guildId;
  if (!queue.has(guildId)) queue.set(guildId, []);
  queue.get(guildId).push(...songs);

  // Only start playback if not already playing
  if (
    !players.has(guildId) ||
    players.get(guildId)._state.status === AudioPlayerStatus.Idle
  ) {
    pausedStates.set(guildId, false);
    await playNext(interaction, guildId, voice);
  }

  // Remove the "RAGE-NSFW is thinking..." deferred reply after queue/now-playing messages are sent
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 2200);
}

// PAGINATED QUEUE WITH BUTTONS
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
  const totalPages = Math.ceil(q.length / itemsPerPage);
  const start = page * itemsPerPage;
  const end = Math.min(start + itemsPerPage, q.length);
  let msg = `🎶 **Music Queue (Page ${page + 1}/${totalPages}):**\n`;
  q.slice(start, end).forEach((song, i) => {
    msg += `**#${start + i + 1}:** ${song.title} _(requested by ${song.requestedBy})_\n`;
  });
  return msg;
}

export async function queueCommand(client, interaction) {
  const guildId = interaction.guildId;
  const q = queue.get(guildId) || [];
  if (q.length === 0)
    return interaction.reply({ content: "The queue is empty.", flags: 1 << 6 });

  const itemsPerPage = 10;
  let page = 0;
  const totalPages = Math.ceil(q.length / itemsPerPage);

  await interaction.reply({
    content: buildQueueMessage(q, page, itemsPerPage),
    components: [queuePaginationRow(page, totalPages)],
    flags: 1 << 6,
  });

  const filter = (btn) =>
    btn.user.id === interaction.user.id &&
    ["queue_prev", "queue_next"].includes(btn.customId);

  const collector = interaction.channel.createMessageComponentCollector({
    filter,
    time: 60_000,
  });

  collector.on("collect", async (btn) => {
    // Always defer the update to prevent multiple acknowledgments error
    await btn.deferUpdate().catch(() => {});
    if (btn.customId === "queue_prev" && page > 0) page--;
    if (btn.customId === "queue_next" && page < totalPages - 1) page++;
    try {
      await interaction.editReply({
        content: buildQueueMessage(q, page, itemsPerPage),
        components: [queuePaginationRow(page, totalPages)],
        flags: 1 << 6,
      });
    } catch (err) {
      // Ignore errors from expired interactions
    }
  });
}

export async function commandsCommand(client, interaction) {
  // List the available bot commands
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
    flags: 1 << 6 });
}

// Fancier Music Control Buttons with emoji and color
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
        q.map((track, i) => ({
          label: `${i + 1}. ${track.title}`,
          value: String(i),
        }))
      )
  );
}

async function playNext(interaction, guildId, voice) {
  const q = queue.get(guildId);
  if (!q || q.length === 0) {
    // Remove now playing message if there is one
    if (nowPlayingMsg.has(guildId)) {
      const { message } = nowPlayingMsg.get(guildId);
      if (message && message.deletable) await message.delete().catch(() => {});
      nowPlayingMsg.delete(guildId);
    }
    players.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    pausedStates.set(guildId, false);
    return;
  }

  const track = q[0];

  if (
    !track.url ||
    typeof track.url !== "string" ||
    (!ytVideoRegex.test(track.url) && !ytPlaylistRegex.test(track.url))
  ) {
    await interaction.followUp({
      content: `Track "${track.title || "Unknown"}" has an invalid or unsupported URL and will be skipped. URL: ${track.url}`,
      flags: 1 << 6 });
    q.shift();
    return playNext(interaction, guildId, voice);
  }

  let resource;
  let used = "ytdl-core";
  try {
    // Try ytdl-core first
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
    used = "play-dl";
    try {
      // If ytdl fails, fallback to play-dl
      const { stream } = await play.video_stream(track.url);
      resource = createAudioResource(stream, {
        inputType: "arbitrary",
        inlineVolume: true,
      });
    } catch (e2) {
      await interaction.followUp({
        content: `Failed to stream "${track.title}":\n- ytdl-core error: ${e1.message}\n- play-dl error: ${e2.message}`,
        flags: 1 << 6 });
      q.shift();
      return playNext(interaction, guildId, voice);
    }
  }

  // Set initial or current volume
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
    player.on("stateChange", (oldState, newState) => {
      //console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
    });
    player.on("error", (error) => {
      console.error("[AudioPlayer Error]:", error);
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

  pausedStates.set(guildId, false);

  // --- FANCY NOW PLAYING MESSAGE (Title & Requester, no thumbnail) ---
  if (nowPlayingMsg.has(guildId)) {
    const { message } = nowPlayingMsg.get(guildId);
    if (message && message.deletable) await message.delete().catch(() => {});
    nowPlayingMsg.delete(guildId);
  }

  const embed = new EmbedBuilder()
    .setColor(0xff5555)
    .setTitle("🎶 Now Playing")
    .setDescription(`**${track.title}**\nRequested by: **${track.requestedBy}**\n\n**Volume:** ${Math.round(currentVolume * 100)}%`)
    .setURL(track.url)
    .setTimestamp(new Date());

  const sentMsg = await interaction.channel.send({
    embeds: [embed],
    components: [musicButtons(currentVolume, false)],
  });
  nowPlayingMsg.set(guildId, { message: sentMsg, channelId: interaction.channel.id });
}

export async function handleMusicButton(interaction) {
  const guildId = interaction.guildId;
  const player = players.get(guildId);
  let currentVol = volumes.get(guildId) ?? 1.0;
  let didChangeVol = false;
  let wasPaused = pausedStates.get(guildId) ?? false;

  if (!player)
    return interaction.reply({
      content: "Nothing is playing.",
      flags: 1 << 6 });

  // Always acknowledge the interaction to avoid "This interaction failed"
  try {
    await interaction.deferUpdate();
  } catch (e) {
    // Ignore "Unknown interaction" errors caused by rapid/spam clicks
    if (e.code === 10062) return;
    throw e;
  }

  if (interaction.customId === "pause_resume") {
    if (!wasPaused) {
      player.pause();
      pausedStates.set(guildId, true);
      await sendAndAutoDelete(interaction, { content: "RAGE-NSFW: Paused." });
    } else {
      player.unpause();
      pausedStates.set(guildId, false);
      await sendAndAutoDelete(interaction, { content: "RAGE-NSFW: Resumed." });
    }
  }
  if (interaction.customId === "skip") {
    queue.get(guildId)?.shift();
    player.stop();
    await sendAndAutoDelete(interaction, { content: "RAGE-NSFW: Skipped." });
  }
  if (interaction.customId === "stop") {
    queue.set(guildId, []);
    player.stop();
    getVoiceConnection(guildId)?.destroy();
    players.delete(guildId);
    pausedStates.set(guildId, false);
    // Remove now playing message if there is one
    if (nowPlayingMsg.has(guildId)) {
      const { message } = nowPlayingMsg.get(guildId);
      if (message && message.deletable) await message.delete().catch(() => {});
      nowPlayingMsg.delete(guildId);
    }
    await sendAndAutoDelete(interaction, { content: "RAGE-NSFW: Stopped and disconnected." });
  }
  if (interaction.customId === "volume_down") {
    // Lower volume by 10%, min 5%
    currentVol = Math.max(0.05, currentVol - 0.1);
    volumes.set(guildId, currentVol);
    // Set volume on currently playing resource
    const resource = player.state.resource;
    if (resource && resource.volume) {
      resource.volume.setVolume(currentVol);
      didChangeVol = true;
    }
    await sendAndAutoDelete(interaction, {
      content: `RAGE-NSFW: Volume: ${Math.round(currentVol * 100)}%`,
    });
  }
  if (interaction.customId === "volume_up") {
    // Raise volume by 10%, max 200%
    currentVol = Math.min(2.0, currentVol + 0.1);
    volumes.set(guildId, currentVol);
    // Set volume on currently playing resource
    const resource = player.state.resource;
    if (resource && resource.volume) {
      resource.volume.setVolume(currentVol);
      didChangeVol = true;
    }
    await sendAndAutoDelete(interaction, {
      content: `RAGE-NSFW: Volume: ${Math.round(currentVol * 100)}%`,
    });
  }

  // Update Now Playing message's buttons to reflect new volume or pause state
  if ((didChangeVol || interaction.customId === "pause_resume") && nowPlayingMsg.has(guildId)) {
    const { message } = nowPlayingMsg.get(guildId);
    try {
      await message.edit({ components: [musicButtons(currentVol, pausedStates.get(guildId) ?? false)] });
      // Also update embed with new volume if volume changed
      if (didChangeVol) {
        const embed = message.embeds[0]
          ? EmbedBuilder.from(message.embeds[0])
          : new EmbedBuilder().setTitle("🎶 Now Playing");
        embed.setDescription(embed.data.description.replace(/(\*\*Volume:\*\* )(\d+)%/, `**Volume:** ${Math.round(currentVol * 100)}%`));
        await message.edit({ embeds: [embed] });
      }
    } catch (e) {
      // Ignore edit errors
    }
  }
}

export async function handleMusicMenu(interaction) {
  const guildId = interaction.guildId;
  const selected = interaction.values[0];
  const q = queue.get(guildId);

  if (!q || q.length === 0) {
    return interaction.reply({ content: "Queue empty.", flags: 1 << 6 });
  }

  const idx = Number(selected);
  if (isNaN(idx) || idx < 0 || idx >= q.length) {
    return interaction.reply({ content: "Invalid selection.", flags: 1 << 6 });
  }

  const track = q[idx];
  if (!track) {
    return interaction.reply({ content: "Track not found.", flags: 1 << 6 });
  }

  await interaction.reply({
    content: `Selected: **${track.title}** (requested by ${track.requestedBy})`,
  });
}