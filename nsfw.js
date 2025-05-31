import dotenv from 'dotenv';
dotenv.config();

import sightengine from 'sightengine';
const client = sightengine(process.env.SIGHTENGINE_USER, process.env.SIGHTENGINE_SECRET);

export default async function nsfwCheck(interaction, imageUrl, moderationSettings = {}, opts = {}) {
  // If called from messageCreate (auto), opts.isAuto will be true and opts.message will be present
  if (!opts?.isAuto && interaction.deferReply) await interaction.deferReply();
  try {
    const result = await client.check(['nudity', 'wad', 'offensive']).set_url(imageUrl);
    //console.log(result);

    if (result.status && result.status !== 'success') {
      if (opts?.isAuto) return;
      if (interaction.editReply) {
        await interaction.editReply('Sightengine API error: ' + (result.error?.message || JSON.stringify(result)));
      }
      return;
    }

    const nudity = result.nudity || {};
    const weapon = result.weapon ?? 0;
    const alcohol = result.alcohol ?? 0;
    const drugs = result.drugs ?? 0;
    const offensive = result.offensive || {};

    // Use settings, fallback to 0.7
    const thresholds = moderationSettings?.thresholds || {};
    const checks = moderationSettings?.checks || {};
    const rawThresh = thresholds.nudity_raw ?? 0.7;
    const partThresh = thresholds.nudity_partial ?? 0.7;
    const offThresh = thresholds.offensive_prob ?? 0.7;

    let blocked = false;
    let reasons = [];
	console.log('MOD SETTINGS:', moderationSettings);
	//console.log('NUDITY RAW:', nudity.raw, 'THRESH:', rawThresh, 'CHECK:', checks.nudity_raw);
    if (checks.nudity_raw !== false && (nudity.raw ?? 0) > rawThresh) {
      blocked = true;
      reasons.push('nudity (raw)');
    }
    if (checks.nudity_partial !== false && (nudity.partial ?? 0) > partThresh) {
      blocked = true;
      reasons.push('nudity (partial)');
    }
    if (checks.offensive !== false && (offensive.prob ?? 0) > offThresh) {
      blocked = true;
      reasons.push('offensive');
    }
    if (checks.wad !== false && (weapon > 0.5 || alcohol > 0.5 || drugs > 0.5)) {
      blocked = true;
      reasons.push('wad');
    }

    if (blocked) {
      // If this was an automatic scan (messageCreate), delete the message
      if (opts?.isAuto && opts.message && opts.message.deletable) {
        try { await opts.message.delete(); } catch(e) {}
        await opts.message.channel.send(
          `:warning: **Image removed for: ${reasons.join(', ')}.** (User: <@${opts.message.author.id}>)`
        );
        return true;
      } else if (interaction.editReply) {
        // Normal /nsfwcheck command
        await interaction.editReply(`:warning: **Image blocked for: ${reasons.join(', ')}.**`);
        return true;
      }
    }

    // If not blocked and slash command, show results
    if (!opts?.isAuto && interaction.editReply) {
      let msg = `**NSFW Check Results:**\n`;
      msg += `Nudity (raw): ${nudity.raw ?? 'N/A'}\n`;
      msg += `Nudity (partial): ${nudity.partial ?? 'N/A'}\n`;
      msg += `Nudity (safe): ${nudity.safe ?? 'N/A'}\n`;
      msg += `Weapon: ${weapon}\nAlcohol: ${alcohol}\nDrugs: ${drugs}\nOffensive: ${offensive.prob ?? 'N/A'}\n`;
      msg += `:white_check_mark: This image is likely safe.`;
      await interaction.editReply(msg);
    }
    return false;
  } catch (err) {
    if (!opts?.isAuto && interaction.editReply) await interaction.editReply('Error checking image: ' + err.message);
  }
}