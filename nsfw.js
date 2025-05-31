import dotenv from 'dotenv';
dotenv.config();

import sightengine from 'sightengine';
const client = sightengine(process.env.SIGHTENGINE_USER, process.env.SIGHTENGINE_SECRET);
export default async function nsfwCheck(interaction, imageUrl) {
  await interaction.deferReply();
  try {
    const result = await client.check(['nudity', 'wad', 'offensive']).set_url(imageUrl);
    // Defensive: log the result for debug
    console.log(result);

    if (result.status && result.status !== 'success') {
		console.log('USER:', process.env.SIGHTENGINE_USER, 'SECRET:', process.env.SIGHTENGINE_SECRET);
      await interaction.editReply('Sightengine API error: ' + (result.error?.message || JSON.stringify(result)));
      return;
    }

    const nudity = result.nudity || {};
    const weapon = result.weapon ?? 'N/A';
    const alcohol = result.alcohol ?? 'N/A';
    const drugs = result.drugs ?? 'N/A';
    const offensive = result.offensive || {};

    let msg = `**NSFW Check Results:**\n`;
    msg += `Nudity (raw): ${nudity.raw ?? 'N/A'}\n`;
    msg += `Nudity (partial): ${nudity.partial ?? 'N/A'}\n`;
    msg += `Nudity (safe): ${nudity.safe ?? 'N/A'}\n`;
    msg += `Weapon: ${weapon}\nAlcohol: ${alcohol}\nDrugs: ${drugs}\nOffensive: ${offensive.prob ?? 'N/A'}\n`;

    if ((nudity.raw ?? 0) > 0.7 || (nudity.partial ?? 0) > 0.7 || (offensive.prob ?? 0) > 0.7) {
      msg += `:warning: **This image is likely NSFW!**`;
    } else {
      msg += `:white_check_mark: This image is likely safe.`;
    }
    await interaction.editReply(msg);
  } catch (err) {
    await interaction.editReply('Error checking image: ' + err.message);
  }
}