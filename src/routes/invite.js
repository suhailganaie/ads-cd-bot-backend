import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { awardReferral } from '../services/referrals.js';
import { zInviteClaim, zTelegramId } from '../services/validators.js';

export const invite = Router();

invite.post('/invite/claim', asyncHandler(async (req, res) => {
  const { inviter_tid } = zInviteClaim.parse(req.body || {});
  const invitee_tid = zTelegramId.parse(req.header('x-telegram-id') || req.body?.invitee_tid);
  const result = await awardReferral(inviter_tid, invitee_tid);
  if (!result.ok) return res.status(409).json(result);
  res.json({ ok: true, ...result });
}));
