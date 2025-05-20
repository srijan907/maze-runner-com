import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import pino from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState, getContentType } from '@whiskeysockets/baileys';
import { File } from 'megajs';

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const PORT = process.env.PORT || 3000;
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT === 'true';
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');
let useQR = false;
let Matrix = null;

// Express app setup
const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use(express.static('public'));

// Logger
const logger = pino({
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

// Ensure session dir exists
async function ensureSessionDir() {
  try {
    await fs.access(sessionDir);
  } catch {
    await fs.mkdir(sessionDir, { recursive: true });
  }
}

// HTML route
app.get('/', async (req, res) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Failed to load interface');
  }
});

// SESSION SETUP route
app.post('/set-session', async (req, res) => {
  const { SESSION_ID } = req.body;
  if (!SESSION_ID) return res.status(400).json({ error: 'SESSION_ID is required' });

  try {
    process.env.SESSION_ID = SESSION_ID;
    const success = await downloadSessionData();
    if (success) {
      await startWhatsApp();
      res.json({ success: true, message: 'Bot started successfully' });
    } else {
      res.status(500).json({ error: 'Failed to download session' });
    }
  } catch (e) {
    logger.error('Session error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Download session from MEGA
async function downloadSessionData() {
  try {
    const sessionPart = process.env.SESSION_ID?.split('CLOUD-AI~')[1];
    if (!sessionPart || !sessionPart.includes('#')) throw new Error('Invalid SESSION_ID format');

    const [fileID, decryptKey] = sessionPart.split('#');
    const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
    const data = await new Promise((resolve, reject) => {
      file.download((err, data) => (err ? reject(err) : resolve(data)));
    });

    await fs.writeFile(credsPath, data);
    logger.info('Session downloaded');
    return true;
  } catch (e) {
    logger.error('Download error:', e);
    return false;
  }
}

// WhatsApp startup
async function startWhatsApp() {
  try {
    await ensureSessionDir();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    Matrix = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: useQR,
      auth: state,
      browser: ["Cloud-AI", "Safari", "3.0"],
      getMessage: async () => ({ conversation: "Hello" })
    });

    Matrix.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason !== DisconnectReason.loggedOut) {
          logger.warn('Reconnecting...');
          setTimeout(startWhatsApp, 5000);
        } else {
          logger.error('Logged out.');
        }
      } else if (connection === 'open') {
        logger.info('Connected to WhatsApp');
        await sendWelcomeMessage();
      }
    });

    Matrix.ev.on('creds.update', saveCreds);

    // Auto react/view status
    Matrix.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message) return;

      const contentType = getContentType(msg.message);
      msg.message = (contentType === 'ephemeralMessage')
        ? msg.message.ephemeralMessage.message
        : msg.message;

      if (msg.key.remoteJid === 'status@broadcast' && AUTO_STATUS_REACT) {
        try {
          await Matrix.readMessages([msg.key]);
          const emojiList = ['💫', '💎', '🔥', '✅', '🦖', '👀', '💯', '😎'];
          const emoji = emojiList[Math.floor(Math.random() * emojiList.length)];

          await Matrix.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key
            }
          });

          logger.info(`Auto-reacted to status with ${emoji}`);
        } catch (e) {
          logger.warn('Auto-react error:', e);
        }
      }
    });

  } catch (e) {
    logger.error('Startup error:', e);
  }
}

// Welcome message
async function sendWelcomeMessage() {
  if (!Matrix?.user) return;
  try {
    await Matrix.sendMessage(Matrix.user.id, {
      text: `╭─── *BOT ONLINE* ───╮
│ Time: ${new Date().toLocaleString()}
│ Host: ${process.env.RENDER ? 'Render.com' : 'Local'}
│ Auto Status React: ${AUTO_STATUS_REACT ? 'ON' : 'OFF'}
╰────────────────────╯`
    });
  } catch (e) {
    logger.warn('Welcome message error:', e);
  }
}

// Server start
server.listen(PORT, async () => {
  logger.info(`Server running on http://localhost:${PORT}`);

  try {
    await fs.access(credsPath);
    logger.info('Found session, starting WhatsApp...');
    await startWhatsApp();
  } catch {
    if (process.env.SESSION_ID) {
      logger.info('Downloading session...');
      const ok = await downloadSessionData();
      if (ok) await startWhatsApp();
      else {
        useQR = true;
        await startWhatsApp();
      }
    } else {
      useQR = true;
      await startWhatsApp();
    }
  }
});

// Graceful exit
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});
