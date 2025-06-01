import fs from "fs";
import { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const SIGHTENGINE_MODELS = [
  { label: "Nudity (v2.1)", value: "nudity-2.1" },
  { label: "Offensive Content (v2.0)", value: "offensive-2.0" },
  { label: "Scam", value: "scam" },
  { label: "Text Content", value: "text-content" },
  { label: "Face Attributes", value: "face-attributes" },
  { label: "Gore (v2.0)", value: "gore-2.0" },
  { label: "Violence", value: "violence" },
  { label: "Self Harm", value: "self-harm" },
];

// Generates the select menu for Sightengine models
export function sightengineModelMenu(selectedModels = []) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sightengine_model_select")
      .setPlaceholder("Select Sightengine Models (multiple allowed)")
      .setMinValues(1)
      .setMaxValues(SIGHTENGINE_MODELS.length)
      .addOptions(
        SIGHTENGINE_MODELS.map((model) => ({
          ...model,
          default: selectedModels.includes(model.value),
        }))
      )
  );
}

// Generates a Save button
export function saveModelsButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("save_sightengine_models")
      .setLabel("💾 Save Models")
      .setStyle(ButtonStyle.Success)
  );
}

// Loads moderation settings from file
export function loadModerationSettings() {
  try {
    const raw = fs.readFileSync("moderation_settings.json", "utf-8");
    return JSON.parse(raw);
  } catch {
    return { sightengine_models: [] };
  }
}

// Saves selected models to moderation_settings.json
export function saveModerationSettings(selectedModels) {
  const current = loadModerationSettings();
  current.sightengine_models = selectedModels;
  fs.writeFileSync("moderation_settings.json", JSON.stringify(current, null, 2));
}

// Discord interaction handler for select menu and save button
export async function handleSightengineMenu(interaction) {
  // Handle model selection
  if (interaction.isStringSelectMenu() && interaction.customId === "sightengine_model_select") {
    const selected = interaction.values;
    // Update menu with defaults and show Save button
    await interaction.update({
      content: `Selected models: ${selected.map((v) => `\`${v}\``).join(", ")}`,
      components: [sightengineModelMenu(selected), saveModelsButton()],
    });
    // Optionally, you could auto-save here instead of waiting for button
    return;
  }
  // Handle save button
  if (interaction.isButton() && interaction.customId === "save_sightengine_models") {
    // Get the latest selected models from the previous message, fallback to empty
    let selectedModels = [];
    const selectMenu = interaction.message.components?.[0]?.components?.find(
      (comp) => comp.data && comp.data.custom_id === "sightengine_model_select"
    );
    if (selectMenu) {
      selectedModels = selectMenu.data.options.filter((o) => o.default).map((o) => o.value);
    }
    // Save to file
    saveModerationSettings(selectedModels);
    await interaction.reply({
      content: `✅ Saved models to moderation_settings.json: ${selectedModels.map((v) => `\`${v}\``).join(", ") || "None"}`,
      ephemeral: true,
    });
    return;
  }
}