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
  DisconnectReason,
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

// Serve homepage
app.get('/', async (req, res) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    res.send(html);
  } catch {
    res.send('✅ Cloud AI Multi-User Bot is running.');
  }
});

// === Set session (multi-user)
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

// === Set session (fallback for frontend without userId)
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

// === QR login for manual connect
app.get('/qr-login/:userId', async (req, res) => {
  const { userId } = req.params;
  await startWhatsApp(userId, true);
  res.send(`Scan QR for ${userId} in terminal.`);
});

// === Get connected users
app.get('/users', (req, res) => {
  res.json({ users: [...userSockets.keys()] });
});

// === Utilities
async function ensureSessionPath(userId) {
  const userPath = path.join(sessionBasePath, userId);
  try {
    await fs.access(userPath);
  } catch {
    await fs.mkdir(userPath, { recursive: true });
  }
  return userPath;
}

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
      await sock.sendMessage(sock.user.id, {
        text: `✅ Connected as ${userId}`
      });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.remoteJid !== 'status@broadcast') return;

    try {
      const type = getContentType(msg.message);
      const message = type === 'ephemeralMessage' ? msg.message.ephemeralMessage.message : msg.message;
      if (!message) return;

      await sock.readMessages([msg.key]);

      const myJid = sock.user.id;
      const emojis = ['🔥', '💯', '💎', '⚡', '✅', '💙', '👀', '🌟', '😎'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];

      await sock.sendMessage('status@broadcast', {
        react: { text: emoji, key: msg.key }
      }, {
        statusJidList: [msg.key.participant, myJid]
      });

      logger.info(`${userId} reacted to status with ${emoji}`);
    } catch (err) {
      logger.warn(`${userId} status react error:`, err);
    }
  });
}

// === Launch server
server.listen(PORT, () => {
  logger.info(`Multi-user bot running at http://localhost:${PORT}`);
});
