require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

const verifiedUsers = new Set();
const CAPTCHA_TIMEOUT = 30000;

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Generate captcha (image URL instead of canvas)
function generateCaptcha() {
  const text = Math.random().toString(36).substring(2, 7);
  const url = `https://dummyimage.com/200x80/000/fff&text=${text}`;
  return { text, url };
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member;

  // User joined VC
  if (!oldState.channel && newState.channel) {

    // Skip verified users
    if (verifiedUsers.has(member.id)) return;

    try {
      // Kick from VC
      await member.voice.disconnect();

      const captcha = generateCaptcha();

      const dm = await member.send({
        content: `🧩 Solve this captcha:\n${captcha.url}`
      });

      const filter = m => m.author.id === member.id;

      const collected = await dm.channel.awaitMessages({
        filter,
        max: 1,
        time: CAPTCHA_TIMEOUT
      });

      if (!collected.size) {
        return member.send("⏰ Time expired. Try again.");
      }

      const answer = collected.first().content;

      if (answer.toLowerCase() === captcha.text.toLowerCase()) {
        verifiedUsers.add(member.id);
        await member.send("✅ Verified! You can now join the voice channel.");
      } else {
        await member.send("❌ Wrong captcha. Try joining again.");
      }

    } catch (err) {
      console.log("⚠️ DM failed or error occurred.", err);
    }
  }

  // Reset verification when user leaves VC
  if (oldState.channel && !newState.channel) {
    verifiedUsers.delete(member.id);
  }
});

client.login(process.env.TOKEN);