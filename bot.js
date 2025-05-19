import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import P from "pino";
import fs from "fs";
import qrcode from "qrcode";

const { state, saveCreds } = await useMultiFileAuthState('./auth');
let sock = null;

const getRandomEmoji = () => {
  const emojis = ['❤️', '🔥', '🌝', '😎', '🤯', '🎉', '🌟', '💯', '🙌'];
  return emojis[Math.floor(Math.random() * emojis.length)];
};

export async function startBot(number, sendQR) {
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    browser: ['BERA TECH', 'Chrome', '1.0'],
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrImage = await qrcode.toDataURL(qr);
      sendQR(qrImage);
    }

    if (connection === 'open') {
      const jid = sock.user.id;
      console.log("✅ Connected as:", jid);
      await sock.sendMessage(jid, { text: "BERA TECH BOT Connection established" });
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        startBot(number, sendQR);
      }
    }
  });

  // Auto-view and react to statuses
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') {
        try {
          await sock.readMessages([msg.key]);
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: getRandomEmoji(),
              key: msg.key
            }
          });
          console.log("Reacted to status:", msg.key.participant);
        } catch (e) {
          console.log("Status reaction failed:", e.message);
        }
      }
    }
  });
}
