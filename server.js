sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
  if (connection === 'close') {
    const reason = lastDisconnect?.error?.output?.statusCode;
    logger.warn(`${userId} disconnected: ${reason}`);
  } else if (connection === 'open') {
    logger.info(`${userId} connected`);

    const bioText = 'RABBIT-XMD CONNECTED। ENJOY';

    try {
      await sock.query({
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', xmlns: 'status', type: 'set' },
        content: [
          { tag: 'status', attrs: {}, content: Buffer.from(bioText) }
        ]
      });
      logger.info(`Static bio set for ${userId}`);
    } catch (e) {
      logger.error(`Failed to set bio for ${userId}:`, e);
    }

    // Welcome message পাঠান
    const welcomeMessage = `*Hello there RABBIT-XMD User!* 👋🏻

> Simple, Clean & Packed With Features — Say hello to *RABBIT-XMD* WhatsApp Bot!

*Thanks for choosing RABBIT-XMD!*  

──────────────
*Channel:*  
⤷ https://whatsapp.com/channel/0029Vb3NN9cGk1FpTI1rH31Z

*GitHub Repo:*  
⤷ https://github.com/Mr-Rabbit-XMD

*Prefix:* \`. \`

──────────────  
© Powered by *〆͎ＭＲ－Ｒａｂｂｉｔ* 🤍`;

    try {
      await sock.sendMessage(sock.user.id, {
        text: welcomeMessage
      });
      logger.info(`Welcome message sent to ${userId}`);
    } catch (err) {
      logger.error(`Failed to send welcome message to ${userId}:`, err);
    }
  }
});
