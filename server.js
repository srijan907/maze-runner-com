import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import pino from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  getContentType
} from '@whiskeysockets/baileys';
import { File } from 'megajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

const logger = pino({
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  level: 'info'
});

const userSockets = new Map();
const sessionBasePath = path.join(__dirname, 'sessions');

// Homepage
app.get('/', async (req, res) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    res.send(html);
  } catch {
    res.send('✅ Cloud AI Multi-User Bot is running.');
  }
});

// Ping API endpoint (for HTTP test)
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', status: '🟢 alive', time: new Date().toISOString() });
});

// Set session with userId
app.post('/set-session/:userId', async (req, res) => {
  const { userId } = req.params;
  const { SESSION_ID } = req.body;

  if (!SESSION_ID) return res.status(400).json({ error: 'SESSION_ID required' });

  const success = await downloadSessionData(userId, SESSION_ID);
  if (success) {
    await startWhatsApp(userId, false);
    return res.json({ success: true });
  } else {
    return res.status(500).json({ error: 'Session download failed' });
  }
});

// Set session default
app.post('/set-session', async (req, res) => {
  const { SESSION_ID } = req.body;
  const userId = 'default';

  if (!SESSION_ID) return res.status(400).json({ error: 'SESSION_ID required' });

  const success = await downloadSessionData(userId, SESSION_ID);
  if (success) {
    await startWhatsApp(userId, false);
    return res.json({ success: true });
  } else {
    return res.status(500).json({ error: 'Session download failed' });
  }
});

// QR login
app.get('/qr-login/:userId', async (req, res) => {
  const { userId } = req.params;
  await startWhatsApp(userId, true);
  res.send(`Scan QR for ${userId} in terminal.`);
});

// Get connected users
app.get('/users', (req, res) => {
  res.json({ users: [...userSockets.keys()] });
});

// Ensure user session path exists
async function ensureSessionPath(userId) {
  const userPath = path.join(sessionBasePath, userId);
  try {
    await fs.access(userPath);
  } catch {
    await fs.mkdir(userPath, { recursive: true });
  }
  return userPath;
}

// Download session from MEGA
async function downloadSessionData(userId, sessionId) {
  try {
    const part = sessionId.split("CLOUD-AI~")[1];
    const [fileID, key] = part.split("#");
    const file = File.fromURL(`https://mega.nz/file/${fileID}#${key}`);
    const data = await new Promise((resolve, reject) => {
      file.download((err, data) => err ? reject(err) : resolve(data));
    });

    const userPath = await ensureSessionPath(userId);
    await fs.writeFile(path.join(userPath, 'creds.json'), data);
    logger.info(`Session written for ${userId}`);
    return true;
  } catch (err) {
    logger.error(`Session download failed for ${userId}:`, err);
    return false;
  }
}

// Start WhatsApp bot
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
    } else if (connection === 'open') {
      logger.info(`${userId} connected`);

      const welcomeText = `*Hello there RABBIT-XMD User!* 👋🏻

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

      await sock.sendMessage(sock.user.id, {
        text: welcomeText
      });
    }
  });

  // Handle incoming messages (.ping command with latency)
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

    try {
      const type = getContentType(msg.message);
      const content = type === 'conversation'
        ? msg.message.conversation
        : type === 'extendedTextMessage'
        ? msg.message.extendedTextMessage.text
        : '';

      const sender = msg.key.remoteJid;
      const fromBot = msg.key.fromMe;

      if (fromBot || !content) return;

      const command = content.trim().toLowerCase();

      if (command === '.ping') {
        const start = Date.now();
        await sock.sendPresenceUpdate('composing', sender);
        await new Promise(resolve => setTimeout(resolve, 100));
        const end = Date.now();
        const pingTime = end - start;

        await sock.sendMessage(sender, {
          text: `🏓 pong!\n⏱️ Response Time: *${pingTime}ms*`
        }, { quoted: msg });

        logger.info(`${userId} replied to .ping in ${pingTime}ms`);
      }

    } catch (err) {
      logger.warn(`${userId} message handling error:`, err);
    }
  });
}

// Start HTTP server
server.listen(PORT, () => {
  logger.info(`Multi-user bot running at http://localhost:${PORT}`);
});
