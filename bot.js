import baileys from "@whiskeysockets/baileys";
import Pino from "pino";
import fs from "fs";
import path from "path";

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  usePairingCode
} = baileys;

const EMOJIS = ["❤️", "🔥", "🌝", "😂", "👍", "😎", "👏", "🙌"];

export async function startBot(number, sendCode) {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: Pino({ level: "silent" }),
    auth: state,
    browser: ["Bera Tech", "Chrome", "1.0"]
  });

  if (!sock.authState.creds.registered) {
    const code = await usePairingCode(sock, number);
    sendCode(code);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;
    if (connection === "open") {
      const jid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      await sock.sendMessage(jid, { text: "BERA TECH BOT Connection established" });

      // Start reacting to statuses
      sock.ev.on("messages.upsert", async ({ messages }) => {
        for (let msg of messages) {
          if (msg.key.remoteJid?.endsWith("@status")) {
            const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            try {
              await sock.sendReaction(msg.key.remoteJid, emoji, msg.key.id);
            } catch (e) {
              console.error("Reaction failed:", e);
            }
          }
        }
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}
