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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');
const AUTO_STATUS_REACT = true; // ON by default
let useQR = false;
let Matrix = null;

app.use(express.json());
app.use(express.static('public'));

const logger = pino({
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

async function ensureSessionDir() {
  try {
    await fs.access(sessionDir);
  } catch {
    await fs.mkdir(sessionDir, { recursive: true });
  }
}

app.get('/', async (req, res) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    res.send(html);
  } catch {
    res.status(500).send('Index page not found');
  }
});

app.post('/set-session', async (req, res) => {
  const { SESSION_ID } = req.body;
  if (!SESSION_ID) return res.status(400).json({ error: 'SESSION_ID is required' });

  try {
    process.env.SESSION_ID = SESSION_ID;
    const success = await downloadSessionData();
    if (success) {
      await startWhatsApp();
      res.json({ success: true, message: 'Bot started' });
    } else {
      res.status(500).json({ error: 'Download failed' });
    }
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: e.message });
  }
});

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
    logger.error('MEGA Download failed:', e);
    return false;
  }
}

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
      browser: ["Core-AI", "Safari", "3.0"],
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

    Matrix.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message) return;

      const contentType = getContentType(msg.message);
      msg.message = contentType === 'ephemeralMessage' ? msg.message.ephemeralMessage.message : msg.message;

      if (msg.key.remoteJid === 'status@broadcast' && AUTO_STATUS_REACT) {
        try {
          await Matrix.readMessages([msg.key]);
          const emojis = ['💫', '💎', '🔥', '✅', '🦖', '👀', '💯', '😎'];
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];

          await Matrix.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key
            }
          });

          logger.info(`Reacted to status with ${emoji}`);
        } catch (e) {
          logger.warn('Reaction failed:', e);
        }
      }
    });

  } catch (e) {
    logger.error('Startup failed:', e);
  }
}

async function sendWelcomeMessage() {
  try {
    if (!Matrix?.user) return;
    await Matrix.sendMessage(Matrix.user.id, {
      text: `╭─── *BOT ONLINE* ───╮
│ Time: ${new Date().toLocaleString()}
│ Status AutoReact: ✅ ON
│ Session Ready: ✅
╰────────────────────╯`
    });
  } catch (e) {
    logger.warn('Welcome message error:', e);
  }
}

server.listen(PORT, async () => {
  logger.info(`Server ready: http://localhost:${PORT}`);

  try {
    await fs.access(credsPath);
    logger.info('Session found, booting...');
    await startWhatsApp();
  } catch {
    if (process.env.SESSION_ID) {
      const ok = await downloadSessionData();
      if (ok) return await startWhatsApp();
    }

    useQR = true;
    await startWhatsApp();
  }
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});
