import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { auth, requireAuth } from '../middleware/auth.js';
import { createWithdrawal, MIN_TOKENS, RATIO } from '../services/withdrawals.js';
import { query } from '../db.js';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin.js';

export const withdrawals = Router();

// Basic EVM address shape (0x + 40 hex); swap to EIP-55 later if needed
const zEthAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid_address').max(200);

const zWithdraw = z.object({
  tokens: z.number().int().min(MIN_TOKENS),
  address: zEthAddress.optional()
});

// Public rules for client UI
withdrawals.get('/withdrawals/rules', (_req, res) => {
  res.json({ ratio: RATIO, min_tokens: MIN_TOKENS });
}); // Simple metadata endpoint for frontends. [web:3265]

// Create a withdrawal request (user)
withdrawals.post('/withdrawals', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const body = zWithdraw.parse(req.body || {});
  const result = await createWithdrawal(req.user.id, body.tokens, body.address);
  if (!result.ok) return res.status(400).json(result);
  res.status(201).json(result);
})); // Validate at the edge and delegate to service. [web:3265]

// ---------- Admin review endpoints ----------

// List pending requests (admin)
withdrawals.get('/withdrawals/pending', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select w.id, u.telegram_id, u.username, w.tokens, w.points_debited, w.status, w.address, w.created_at
     from withdrawals w
     join users u on u.id = w.user_id
     where w.status = 'pending'
     order by w.created_at desc
     limit 200`
  );
  res.json({ items: rows });
})); // Separate read endpoint for queues is a common REST pattern. [web:3265]

// Approve (finalize) a pending request (admin)
const zApprove = z.object({ tx_hash: z.string().max(100).optional() });
withdrawals.post('/withdrawals/:id/approve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  z.number().int().positive().parse(id);
  zApprove.parse(req.body || {}); // tx_hash optional for audit

  await query('begin');

  // Lock the withdrawal row to prevent concurrent processing
  const { rows: [w] } = await query(
    `select id, user_id, tokens, points_debited, status
       from withdrawals
      where id=$1 for update`,
    [id]
  ); // Row lock ensures single approval/rejection. [web:3094][web:3272]
  if (!w) { await query('rollback'); return res.status(404).json({ error: 'not_found' }); }
  if (w.status !== 'pending') { await query('rollback'); return res.status(400).json({ error: 'not_pending' }); }

  // Finalize without changing points (already debited on creation)
  const { rows: [updated] } = await query(
    `update withdrawals set status='approved'
      where id=$1
      returning id, status`,
    [id]
  );

  await query('commit');
  res.json({ ok: true, withdrawal: updated });
})); // Approval only changes status; accounting was handled at request time. [web:3277]

// Reject (refund) a pending request (admin)
const zReject = z.object({ reason: z.string().max(200).optional() });
withdrawals.post('/withdrawals/:id/reject', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  z.number().int().positive().parse(id);
  const { reason } = zReject.parse(req.body || {});

  await query('begin');

  // Lock the withdrawal row to prevent concurrent processing
  const { rows: [w] } = await query(
    `select id, user_id, tokens, points_debited, status
       from withdrawals
      where id=$1 for update`,
    [id]
  ); // Ensures refund is applied at most once. [web:3094][web:3272]
  if (!w) { await query('rollback'); return res.status(404).json({ error: 'not_found' }); }
  if (w.status !== 'pending') { await query('rollback'); return res.status(400).json({ error: 'not_pending' }); }

  // Refund points and write reversing ledger entry
  await query('update users set points = points + $1 where id=$2', [w.points_debited, w.user_id]);
  await query(
    "insert into events(user_id, type, points, meta) values ($1, 'task', $2, $3)",
    [w.user_id, w.points_debited, { reason: 'withdraw_reject', withdrawal_id: w.id, note: reason }]
  );

  const { rows: [updated] } = await query(
    `update withdrawals set status='rejected'
      where id=$1
      returning id, status`,
    [id]
  );

  await query('commit');
  res.json({ ok: true, withdrawal: updated, refunded_points: w.points_debited });
}));
