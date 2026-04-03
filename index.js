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

const userStatus = new Map(); // verifying / verified
const joinCooldown = new Set();

const CAPTCHA_TIMEOUT = 30000;
const VERIFY_EXPIRE = 60000;
const COOLDOWN_TIME = 3000;

// 👉 ID WAITING ROOMKY
const WAITING_ROOM_ID = "TVUJ_CHANNEL_ID";

// BYPASS ROLE IDs
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
  if (!member || member.user.bot) return;

  // bypass role
  if (member.roles.cache.some(role => bypassRoleIDs.includes(role.id))) {
    return;
  }

  // USER JOINED VC
  if (!oldState.channel && newState.channel) {

    const status = userStatus.get(member.id);

    // verified → allow
    if (status === "verified") {
      return;
    }

    // 👉 uložíme původní channel
    const originalChannel = newState.channel;

    // 👉 místo kicku → move do waiting room
    try {
      await member.voice.setChannel(1489718904409292930);
    } catch (err) {
      console.log("Move failed:", err);
    }

    // anti spam
    if (joinCooldown.has(member.id)) return;
    joinCooldown.add(member.id);
    setTimeout(() => joinCooldown.delete(member.id), COOLDOWN_TIME);

    // pokud už řeší captcha → neposílej znovu
    if (status === "verifying") return;

    // nastav verifying
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
        return member.send("Time expired. Try again.");
      }

      const answer = collected.first().content;

      if (answer.toLowerCase() === captcha.text.toLowerCase()) {
        userStatus.set(member.id, "verified");
        await member.send("Verified! Moving you back...");

        // 👉 vrátíme zpět do původního channelu
        try {
          if (originalChannel) {
            await member.voice.setChannel(originalChannel);
          }
        } catch (err) {
          console.log("Return move failed:", err);
        }

        // expire verification
        setTimeout(() => {
          userStatus.delete(member.id);
        }, VERIFY_EXPIRE);

      } else {
        userStatus.delete(member.id);
        await member.send("Wrong captcha. Try again.");
      }

    } catch (err) {
      console.log("DM failed:", err);
      userStatus.delete(member.id);
    }
  }

  // reset když odejde z VC
  if (oldState.channel && !newState.channel) {
    userStatus.delete(member.id);
  }
});

client.login(process.env.TOKEN);