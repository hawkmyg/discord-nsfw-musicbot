import fs from "fs";
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Moderation categories for Discord select menu
export const MODERATION_CATEGORIES = [
  { label: "Nudity (raw)", value: "nudity_raw" },
  { label: "Nudity (partial)", value: "nudity_partial" },
  { label: "Weapons/Ammo/Drugs", value: "wad" },
  { label: "Offensive", value: "offensive" },
  { label: "Spam", value: "spam" },
  { label: "Ads", value: "ads" },
  { label: "Gore", value: "gore" }
  // Add more as needed
];

// Default moderation settings per category
export const DEFAULT_SETTINGS = {
  checks: {
    nudity_raw: true,
    nudity_partial: true,
    wad: true,
    offensive: true,
    spam: true,
    ads: false,
    gore: false
    // Add more as needed
  },
  thresholds: {
    nudity_raw: 0.7,
    nudity_partial: 0.7,
    offensive_prob: 0.7,
    spam_prob: 0.7,
    ads_prob: 0.7,
    gore_prob: 0.7
    // Add more as needed
  }
};

// Load moderation settings from JSON file
export function loadModerationSettings() {
  try {
    if (!fs.existsSync("moderation_settings.json")) {
      return {};
    }
    const raw = fs.readFileSync("moderation_settings.json", "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Save moderation settings to JSON file for a guild
export function saveModerationSettings(guildId, settingsObj) {
  const current = loadModerationSettings();
  current[guildId] = settingsObj;
  fs.writeFileSync("moderation_settings.json", JSON.stringify(current, null, 2));
}

// Generates a select menu for moderation categories
export function moderationCategoryMenu(selected = []) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("moderation_category_select")
      .setPlaceholder("Select moderation categories (multiple allowed)")
      .setMinValues(1)
      .setMaxValues(MODERATION_CATEGORIES.length)
      .addOptions(
        MODERATION_CATEGORIES.map((cat) => ({
          ...cat,
          default: selected.includes(cat.value),
        }))
      )
  );
}

// Generates a Save button for moderation categories
export function saveCategoriesButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("save_moderation_categories")
      .setLabel("💾 Save Categories")
      .setStyle(ButtonStyle.Success)
  );
}

// Moderation command to send/select/save categories
export async function moderationCommand(client, interaction) {
  const settings = loadModerationSettings();
  const guildId = interaction.guildId;
  const selected = Object.keys(settings[guildId]?.checks || {}).filter(k => settings[guildId].checks[k]);
  await interaction.reply({
    content: "Select the moderation categories you want to activate, then press **Save Categories**.",
    components: [moderationCategoryMenu(selected), saveCategoriesButton()],
    flags: 1 << 6,
  });
}

// Discord interaction handler for select menu and save button
export async function handleModerationCategoryMenu(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This must be used in a server.", flags: 1 << 6 });
    return;
  }
  // Handle category selection
  if (interaction.isStringSelectMenu() && interaction.customId === "moderation_category_select") {
    const selected = interaction.values;
    await interaction.update({
      content: `Selected categories: ${selected.map((v) => `\`${v}\``).join(", ")}`,
      components: [moderationCategoryMenu(selected), saveCategoriesButton()],
      flags: 1 << 6,
    });
    return;
  }
  // Handle save button
  if (interaction.isButton() && interaction.customId === "save_moderation_categories") {
    // Try to get selected categories from previous select menu state
    let selectedCategories = [];
    for (const row of interaction.message.components || []) {
      for (const comp of row.components || []) {
        if (comp.data && comp.data.custom_id === "moderation_category_select") {
          selectedCategories = comp.data.options.filter((o) => o.default).map((o) => o.value);
        }
      }
    }
    // Update and save settings
    const settings = loadModerationSettings();
    if (!settings[guildId]) settings[guildId] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // Set checks for all categories
    for (const cat of MODERATION_CATEGORIES.map(c => c.value)) {
      settings[guildId].checks[cat] = selectedCategories.includes(cat);
    }
    saveModerationSettings(guildId, settings[guildId]);
    await interaction.reply({
      content: `✅ Saved categories to moderation_settings.json: ${selectedCategories.map((v) => `\`${v}\``).join(", ") || "None"}`,
      flags: 1 << 6,
    });
    return;
  }
}