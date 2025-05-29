async function startWhatsApp(userId, useQR = false) {
  const userPath = await ensureSessionPath(userId);
  const { state, saveCreds } = await useMultiFileAuthState(userPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: useQR,
    auth: state,
    browser: [userId, 'Safari', '1.0']
    // getMessage অপশন সরানো হয়েছে
  });

  userSockets.set(userId, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      logger.warn(`${userId} disconnected: ${reason}`);
    } else if (connection === 'open') {
      logger.info(`${userId} connected`);
      await sock.sendMessage(sock.user.id, {
        text: `*Hello there RABBIT-XMD User!* 👋🏻

> Simple, Clean & Packed With Features — Say hello to **RABBIT-XMD** WhatsApp Bot!

*Thanks for choosing RABBIT-XMD!*  

──────────────
*Channel:*  
⤷ https://whatsapp.com/channel/0029Vb3NN9cGk1FpTI1rH31Z

*GitHub Repo:*  
⤷ https://github.com/Mr-Rabbit-XMD

*Prefix:* \`. \`

──────────────  
© Powered by *〆͎ＭＲ－Ｒａｂｂｉｔ* 🤍`
      });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    try {
      const messageContent = msg.message;
      const messageType = getContentType(messageContent);

      let text = '';
      if (messageType === 'conversation') {
        text = messageContent.conversation;
      } else if (messageType === 'extendedTextMessage') {
        text = messageContent.extendedTextMessage.text;
      } else {
        return;
      }

      const command = text.trim().toLowerCase();
      const sender = msg.key.remoteJid;

      if (command === '.ping') {
        const start = Date.now();
        await new Promise(r => setTimeout(r, 100));
        const end = Date.now();
        const latency = end - start;

        await sock.sendMessage(sender, {
          text: `🏓 pong!\n⏱️ Response Time: *${latency}ms*`
        }, { quoted: msg });

        logger.info(`${userId} replied to .ping in ${latency}ms`);
      }

    } catch (err) {
      logger.warn(`${userId} message handling error:`, err);
    }
  });
}
