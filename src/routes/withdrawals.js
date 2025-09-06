import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { auth } from '../middleware/auth.js';
import { createWithdrawal, MIN_TOKENS, RATIO } from '../services/withdrawals.js';
import { z } from 'zod';

export const withdrawals = Router();

const zWithdraw = z.object({
  tokens: z.number().int().min(MIN_TOKENS),
  address: z.string().max(200).optional()
});

withdrawals.get('/withdrawals/rules', (_req, res) => {
  res.json({ ratio: RATIO, min_tokens: MIN_TOKENS });
});

withdrawals.post('/withdrawals', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const body = zWithdraw.parse(req.body || {});
  const result = await createWithdrawal(req.user.id, body.tokens, body.address);
  if (!result.ok) return res.status(400).json(result);
  res.status(201).json(result);
}));
