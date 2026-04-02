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
const cooldown = new Set();

const CAPTCHA_TIMEOUT = 30000;
const COOLDOWN_TIME = 30000;

// BYPASS ROLE IDs (dej sem ID rolí)
const bypassRoleIDs = [
  "1489344221952348200"
];

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Captcha generator
function generateCaptcha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let text = "";

  for (let i = 0; i < 5; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const url = `https://dummyimage.com/200x80/000/fff&text=${text}`;
  return { text, url };
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member;

  // Ignore bots
  if (member.user.bot) return;

  // Bypass roles
  if (member.roles.cache.some(role => bypassRoleIDs.includes(role.id))) {
    return;
  }

  // User joined VC
  if (!oldState.channel && newState.channel) {

    if (verifiedUsers.has(member.id)) return;
    if (cooldown.has(member.id)) return;

    cooldown.add(member.id);
    setTimeout(() => cooldown.delete(member.id), COOLDOWN_TIME);

    try {
      await member.voice.disconnect();
    } catch (err) {
      console.log("Cannot disconnect user:", err);
      return;
    }

    const captcha = generateCaptcha();

    try {
      const dm = await member.send({
        embeds: [
          {
            title: "Verification Required",
            description: "Please type the text shown in the captcha image.",
            color: 0x2b2d31,
            image: {
              url: captcha.url
            }
          }
        ]
      });

      const filter = m => m.author.id === member.id;

      const collected = await dm.channel.awaitMessages({
        filter,
        max: 1,
        time: CAPTCHA_TIMEOUT
      });

      if (!collected.size) {
        return member.send("Time expired. Try joining the voice channel again.");
      }

      const answer = collected.first().content;

      if (answer.toLowerCase() === captcha.text.toLowerCase()) {
        verifiedUsers.add(member.id);
        await member.send("Verified! You can now join the voice channel.");
      } else {
        await member.send("Wrong captcha. Try again.");
      }

    } catch (err) {
      console.log("DM failed:", err);
    }
  }

  // Reset verification when leaving VC
  if (oldState.channel && !newState.channel) {
    verifiedUsers.delete(member.id);
  }
});

client.login(process.env.TOKEN);