import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { startBot } from "./bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/start", async (req, res) => {
  const number = req.body.number;
  if (!number || !number.startsWith("+")) {
    return res.json({ error: "Invalid number format." });
  }

  try {
    await startBot(number, (qrImage) => {
      res.json({ qr: qrImage });
    });
  } catch (e) {
    console.error(e);
    res.json({ error: "Bot failed to start." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BERA TECH BOT running on http://localhost:${PORT}`);
});
