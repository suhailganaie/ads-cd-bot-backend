import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { upsertUser } from '../services/referrals.js';
import { sign } from '../middleware/auth.js';
import { zTelegramId } from '../services/validators.js';

export const auth = Router();

auth.post('/auth/login', asyncHandler(async (req, res) => {
  const { telegram_id, username } = req.body || {};
  const tid = zTelegramId.parse(telegram_id);
  const user = await upsertUser(tid, username);
  const token = sign(user);
  res.json({ token, user: { id: user.id, telegram_id: user.telegram_id, points: user.points } });
}));
