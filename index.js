require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

const verifiedUsers = new Set();
const CAPTCHA_TIMEOUT = 30000;

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Generate captcha image
function generateCaptcha() {
  const canvas = Canvas.createCanvas(200, 80);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Random text
  const text = Math.random().toString(36).substring(2, 7);

  // Distorted text
  ctx.font = '30px Arial';
  ctx.fillStyle = '#000';

  for (let i = 0; i < text.length; i++) {
    const x = 30 + i * 30;
    const y = 40 + Math.random() * 20;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.5);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  // Noise lines
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(Math.random() * 200, Math.random() * 80);
    ctx.lineTo(Math.random() * 200, Math.random() * 80);
    ctx.stroke();
  }

  return {
    text,
    buffer: canvas.toBuffer()
  };
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member;

  // User joined voice channel
  if (!oldState.channel && newState.channel) {

    // Skip already verified users
    if (verifiedUsers.has(member.id)) return;

    try {
      // Kick user from VC
      await member.voice.disconnect();

      const captcha = generateCaptcha();
      const attachment = new AttachmentBuilder(captcha.buffer, { name: 'captcha.png' });

      const dm = await member.send({
        content: "🧩 Solve this captcha:",
        files: [attachment]
      });

      const filter = m => m.author.id === member.id;

      const collected = await dm.channel.awaitMessages({
        filter,
        max: 1,
        time: CAPTCHA_TIMEOUT
      });

      if (!collected.size) {
        return member.send("⏰ Time expired.");
      }

      const answer = collected.first().content;

      if (answer === captcha.text) {
        verifiedUsers.add(member.id);
        await member.send("✅ Verified! You can now join the voice channel.");
      } else {
        await member.send("❌ Wrong captcha. Try joining again.");
      }

    } catch (err) {
      console.log("⚠️ DM failed or error occurred.", err);
    }
  }

  // User left voice channel → reset verification
  if (oldState.channel && !newState.channel) {
    verifiedUsers.delete(member.id);
  }
});

client.login(process.env.TOKEN);