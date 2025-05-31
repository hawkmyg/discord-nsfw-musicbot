import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  AudioPlayerStatus,
} from "@discordjs/voice";
//import ytdl from "ytdl-core";
//USE the following because above ytdl-core is broken
import ytdl from "@distube/ytdl-core";

import play from "play-dl";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";

// Strong YouTube URL validation regex
const ytRegex =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;

const queue = new Map(); // guildId -> [ {url, title, requestedBy} ]
const players = new Map(); // guildId -> audioPlayer

export async function playCommand(client, interaction) {
  const query = interaction.options.getString("query");
  const voice = interaction.member.voice.channel;
  if (!voice)
    return interaction.reply({
      content: "Join a voice channel first!",
      flags: 1 << 6,
    });

  if (!query || typeof query !== "string" || !query.trim()) {
    return interaction.reply({
      content: "You must provide a valid YouTube link or search keywords.",
      flags: 1 << 6,
    });
  }

  await interaction.deferReply();

  // Try to find video by link or keywords
  let yt_url = query;
  let yt_title = null;
  try {
    if (!ytRegex.test(query)) {
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
  } catch (e) {
    return interaction.editReply("Failed to fetch YouTube info: " + e.message);
  }

  const guildId = interaction.guildId;
  if (!queue.has(guildId)) queue.set(guildId, []);
  queue.get(guildId).push({
    url: yt_url,
    title: yt_title,
    requestedBy: interaction.user.username,
  });
  // LOG for debugging
  console.log("[QUEUE ADD]", yt_url);

  await interaction.editReply({
    content: `Queued: **${yt_title}**`,
    components: [musicButtons(), musicMenu(queue.get(guildId))],
  });

  // Only start playback if not already playing
  if (
    !players.has(guildId) ||
    players.get(guildId)._state.status === AudioPlayerStatus.Idle
  ) {
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
    .map(
      (track, i) =>
        `${i === 0 ? "**Now Playing:**" : `**#${i}:**`} ${track.title} _(requested by ${track.requestedBy})_`
    )
    .join("\n");

  await interaction.reply({
    content: `🎶 **Music Queue:**\n${queueList}`,
    flags: 0, // not ephemeral, visible to all
  });
}

export function musicButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pause")
      .setLabel("⏸ Pause")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("resume")
      .setLabel("▶️ Resume")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setLabel("⏭ Skip")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("stop")
      .setLabel("⏹ Stop")
      .setStyle(ButtonStyle.Danger)
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
    players.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    return;
  }

  const track = q[0];
  // LOG for debugging
  console.log("[PLAYNEXT] Attempting", JSON.stringify(track));

  if (
    !track.url ||
    typeof track.url !== "string" ||
    !ytRegex.test(track.url)
  ) {
    await interaction.followUp({
      content: `Track "${track.title || "Unknown"}" has an invalid or unsupported URL and will be skipped. URL: ${track.url}`,
      flags: 1 << 6,
    });
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
    resource = createAudioResource(ytStream, { inputType: "arbitrary" });
  } catch (e1) {
    used = "play-dl";
    try {
      // If ytdl fails, fallback to play-dl
      const { stream } = await play.video_stream(track.url);
      resource = createAudioResource(stream, { inputType: "arbitrary" });
    } catch (e2) {
      await interaction.followUp({
        content: `Failed to stream "${track.title}":\n- ytdl-core error: ${e1.message}\n- play-dl error: ${e2.message}`,
      });
      q.shift();
      return playNext(interaction, guildId, voice);
    }
  }
  console.log(`[STREAM] Using: ${used}`);

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
      console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
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
}

export async function handleMusicButton(interaction) {
  const guildId = interaction.guildId;
  const player = players.get(guildId);
  if (!player)
    return interaction.reply({
      content: "Nothing is playing.",
      flags: 1 << 6,
    });

  if (interaction.customId === "pause") {
    player.pause();
    await interaction.reply({ content: "Paused.", flags: 1 << 6 });
  }
  if (interaction.customId === "resume") {
    player.unpause();
    await interaction.reply({ content: "Resumed.", flags: 1 << 6 });
  }
  if (interaction.customId === "skip") {
    queue.get(guildId)?.shift();
    player.stop();
    await interaction.reply({ content: "Skipped.", flags: 1 << 6 });
  }
  if (interaction.customId === "stop") {
    queue.set(guildId, []);
    player.stop();
    getVoiceConnection(guildId)?.destroy();
    players.delete(guildId);
    await interaction.reply({
      content: "Stopped and disconnected.",
      flags: 1 << 6,
    });
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
    flags: 1 << 6,
  });
}
