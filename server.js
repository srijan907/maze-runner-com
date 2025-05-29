import express from 'express';
import cors from 'cors';
import multer from 'multer';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // আপনার যদি এইচটিএমএল পাবলিক ফোল্ডারে থাকে

const upload = multer(); // ইন-মেমরি স্টোরেজ

// এখানে আপনার WhatsApp socket ক্লায়েন্ট রাখা হবে
// ধরে নিচ্ছি একটি Map আছে যেখানে ইউজারID => socket instance
const userSockets = new Map();

// Dummy sock example - বাস্তবায়ন আপনার কাছে
// userSockets.set('default', someSockInstance);

app.post('/set-session', (req, res) => {
  const { SESSION_ID } = req.body;
  if (!SESSION_ID) {
    return res.status(400).json({ error: 'SESSION_ID is required' });
  }

  // এখানে SESSION_ID প্রোসেস করে সেশন স্টোর করুন
  // যেমনঃ আপনার বটকে সেইশন আপডেট করা

  // For demo:
  console.log('Received SESSION_ID:', SESSION_ID);

  return res.json({ success: true });
});

app.post('/upload-photo/:userId', upload.single('photo'), async (req, res) => {
  const { userId } = req.params;
  const sock = userSockets.get(userId);

  if (!sock) {
    return res.status(404).json({ error: 'User not connected' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  try {
    // sock.updateProfilePicture() হল wa-automate বা baileys এর ফাংশন
    await sock.updateProfilePicture(sock.user.id, req.file.buffer);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error updating profile photo:', err);
    return res.status(500).json({ error: 'Failed to set profile photo' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
