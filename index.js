require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

const userStatus = new Map(); // verifying / verified
const joinCooldown = new Set();
const originalChannels = new Map();

const CAPTCHA_TIMEOUT = 30000;
const VERIFY_EXPIRE = 60000;
const COOLDOWN_TIME = 3000;

const WAITING_ROOM_ID = "1489718904409292930";

const bypassRoleIDs = [
  "1489344221952348200"
];

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

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
  if (!member || member.user.bot) return;

  if (member.roles.cache.some(role => bypassRoleIDs.includes(role.id))) {
    return;
  }

  const status = userStatus.get(member.id);

  // =========================
  // ✅ 1. JOIN (spustí captcha)
  // =========================
  if (!oldState.channel && newState.channel) {

    // uložíme původní channel
    originalChannels.set(member.id, newState.channel.id);

    // přesun do waiting room
    try {
      await member.voice.setChannel(WAITING_ROOM_ID);
    } catch (err) {
      console.log("Move failed:", err);
    }

    if (joinCooldown.has(member.id)) return;
    joinCooldown.add(member.id);
    setTimeout(() => joinCooldown.delete(member.id), COOLDOWN_TIME);

    userStatus.set(member.id, "verifying");

    const captcha = generateCaptcha();

    try {
      const dm = await member.send({
        embeds: [{
          title: "Verification Required",
          description: "Please type the text shown in the captcha image.",
          color: 0x2b2d31,
          image: { url: captcha.url }
        }]
      });

      const filter = m => m.author.id === member.id;

      const collected = await dm.channel.awaitMessages({
        filter,
        max: 1,
        time: CAPTCHA_TIMEOUT
      });

      if (!collected.size) {
        userStatus.delete(member.id);
        originalChannels.delete(member.id);
        return member.send("Time expired. Try again.");
      }

      const answer = collected.first().content;

      if (answer.toLowerCase() === captcha.text.toLowerCase()) {
        userStatus.set(member.id, "verified");
        await member.send("Verified! Moving you back...");

        const originalChannelId = originalChannels.get(member.id);

        try {
          if (originalChannelId) {
            await member.voice.setChannel(originalChannelId);
          }
        } catch (err) {
          console.log("Return move failed:", err);
        }

        originalChannels.delete(member.id);

        setTimeout(() => {
          userStatus.delete(member.id);
        }, VERIFY_EXPIRE);

      } else {
        userStatus.delete(member.id);
        originalChannels.delete(member.id);
        await member.send("Wrong captcha. Try again.");
      }

    } catch (err) {
      console.log("DM failed:", err);
      userStatus.delete(member.id);
      originalChannels.delete(member.id);
    }
  }

  // =========================
  // 🔒 2. SWITCH (blokuje útěk)
  // =========================
  if (oldState.channel && newState.channel) {

    if (status !== "verified" && newState.channel.id !== WAITING_ROOM_ID) {
      try {
        await member.voice.setChannel(WAITING_ROOM_ID);
      } catch (err) {
        console.log("Force move failed:", err);
      }
    }
  }

  // =========================
  // ❌ 3. LEAVE (reset)
  // =========================
  if (oldState.channel && !newState.channel) {
    userStatus.delete(member.id);
    originalChannels.delete(member.id);
  }
});

client.login(process.env.TOKEN);