import express from "express";
import bodyParser from "body-parser";
import { startBot } from "./bot.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/start", async (req, res) => {
  const number = req.body.number;
  if (!number || !number.startsWith("+")) {
    return res.json({ error: "Enter full number with country code (e.g. +254...)" });
  }

  try {
    await startBot(number, (code) => {
      res.json({ code });
    });
  } catch (e) {
    console.error(e);
    res.json({ error: "Failed to start bot" });
  }
});

app.listen(PORT, () => console.log("Server running on port", PORT));
