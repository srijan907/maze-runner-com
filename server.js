import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
    getContentType
} from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { File } from 'megajs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import http from 'http';
import { Handler, Callupdate, GroupUpdate } from './data/index.js';

// Configuration
const prefix = process.env.PREFIX || '!';
const sessionName = "session";
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let Matrix = null;
let useQR = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;

// Logger setup
const logger = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'trace'
});

// Session management
const __dirname = path.dirname(new URL(import.meta.url).pathname;
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        whatsapp: Matrix ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// Session download function
async function downloadSessionData() {
    if (!process.env.SESSION_ID) {
        logger.error('SESSION_ID environment variable missing');
        return false;
    }

    try {
        const [fileID, decryptKey] = process.env.SESSION_ID.split("CLOUD-AI~")[1].split("#");
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                err ? reject(err) : resolve(data);
            });
        });

        await fs.promises.writeFile(credsPath, data);
        logger.info('Session downloaded successfully');
        return true;
    } catch (error) {
        logger.error('Session download failed:', error);
        return false;
    }
}

// WhatsApp connection handler
async function startWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            auth: state,
            browser: ["Cloud-AI", "safari", "3.0"],
            getMessage: async (key) => {
                return { conversation: "WhatsApp Bot" };
            }
        });

        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    if (connectionAttempts < MAX_RETRIES) {
                        connectionAttempts++;
                        logger.info(`Reconnecting... (Attempt ${connectionAttempts}/${MAX_RETRIES})`);
                        setTimeout(startWhatsApp, 5000);
                    } else {
                        logger.error('Max reconnection attempts reached');
                    }
                } else {
                    logger.error('Connection closed. You are logged out.');
                }
            } else if (connection === 'open') {
                connectionAttempts = 0;
                logger.info('Connected to WhatsApp');
                await sendWelcomeMessage();
            }
        });

        Matrix.ev.on('creds.update', saveCreds);
        Matrix.ev.on("messages.upsert", Handler);
        Matrix.ev.on("call", Callupdate);
        Matrix.ev.on("group-participants.update", GroupUpdate);

    } catch (error) {
        logger.error('Connection error:', error);
        setTimeout(startWhatsApp, 10000);
    }
}

async function sendWelcomeMessage() {
    try {
        await Matrix.sendMessage(Matrix.user.id, {
            text: `╭─────────────━┈⊷
│ *BOT ONLINE* 
╰─────────────━┈⊷
│⏰ Time: ${new Date().toLocaleString()}
│💻 Host: ${process.env.RENDER ? 'Render.com' : 'Local'}
╰─────────────━┈⊷`
        });
    } catch (error) {
        logger.error('Welcome message error:', error);
    }
}

// Initialize everything
async function initialize() {
    // Start HTTP server first
    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });

    // Then start WhatsApp connection
    if (fs.existsSync(credsPath)) {
        logger.info('Existing session found');
        await startWhatsApp();
    } else if (process.env.SESSION_ID) {
        logger.info('Downloading session...');
        const success = await downloadSessionData();
        if (success) await startWhatsApp();
    } else {
        useQR = true;
        await startWhatsApp();
    }

    // Keep-alive ping
    setInterval(() => {
        if (Matrix && Matrix.user) {
            logger.debug('Keep-alive check: Connected');
        } else {
            logger.warn('Keep-alive check: Disconnected, attempting reconnect');
            startWhatsApp();
        }
    }, 60000); // Check every minute
}

// Start the application
initialize().catch(error => {
    logger.error('Initialization failed:', error);
    process.exit(1);
});

// Clean exit handler
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    server.close();
    process.exit(0);
});
