import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { awardReferral, getInviteCountByTid } from '../services/referrals.js';
import { zInviteClaim, zTelegramId } from '../services/validators.js';
import { requireAuth } from '../middleware/auth.js'; // sets req.user from Bearer or tma

export const invite = Router();

// Create/claim a referral (idempotent)
invite.post('/invite/claim', asyncHandler(async (req, res) => {
  const { inviter_tid } = zInviteClaim.parse(req.body || {});
  const invitee_tid = zTelegramId.parse(req.header('x-telegram-id') || req.body?.invitee_tid);
  const result = await awardReferral(inviter_tid, invitee_tid);
  if (!result.ok) return res.status(409).json(result); // already referred / self-invite
  res.json({ ok: true, ...result });
})); // Claim endpoint remains write-only; no counting here. [web:2752]

// Read-only: current user's invite count
invite.get('/invite/count', requireAuth, asyncHandler(async (req, res) => {
  // req.user is resolved by middleware from Bearer token or validated tma initData
  const inviter_tid = req.user.telegram_id; // source of truth for the logged-in inviter
  const count = await getInviteCountByTid(inviter_tid); // SELECT COUNT(*) FROM referrals WHERE inviter_id = ?
  res.json({ count });
})); // A separate GET endpoint is the standard pattern for counters. [web:2919][web:2923]
