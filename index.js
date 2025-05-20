import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static index.html
app.use(express.static(__dirname));

// Body parser
app.use(express.json());

// Deploy route
app.post('/deploy-session', async (req, res) => {
  const { session } = req.body;
  if (!session || !session.startsWith('CLOUD-AI~')) {
    return res.status(400).send("Invalid SESSION_ID format.");
  }

  try {
    const configPath = path.join(__dirname, 'config.cjs');
    const configText = await fs.promises.readFile(configPath, 'utf8');

    const updatedText = configText.replace(
      /SESSION_ID:\s*".*?"/,
      `SESSION_ID: "${session}"`
    );

    await fs.promises.writeFile(configPath, updatedText);

    res.send("✅ Session updated. Restarting bot...");
    setTimeout(() => process.exit(0), 1500); // Will auto-restart if hosted under PM2 or hosting that restarts node on exit
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to update session.");
  }
});

app.listen(PORT, () => {
  console.log(`Core AI deployment server running on port ${PORT}`);
});
