import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { auth, requireAuth } from '../middleware/auth.js';
import { createWithdrawal, MIN_TOKENS, RATIO } from '../services/withdrawals.js';
import { query } from '../db.js';
import { z } from 'zod';

export const withdrawals = Router();

// Basic EVM address shape (0x + 40 hex); swap to EIP-55 lib if needed
const zEthAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid_address').max(200);

const zWithdraw = z.object({
  tokens: z.number().int().min(MIN_TOKENS),
  address: zEthAddress.optional()
});

// Public rules for client UI
withdrawals.get('/withdrawals/rules', (_req, res) => {
  res.json({ ratio: RATIO, min_tokens: MIN_TOKENS });
}); // Exposing rule metadata is a common pattern for client-side validation. [web:3035]

// Create a withdrawal request (user)
withdrawals.post('/withdrawals', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const body = zWithdraw.parse(req.body || {});
  const result = await createWithdrawal(req.user.id, body.tokens, body.address);
  if (!result.ok) return res.status(400).json(result);
  res.status(201).json(result);
})); // Route-level schema validation keeps inputs safe at the edge. [web:3032][web:3041]

// ---------- Admin review endpoints ----------

// List pending requests (admin)
withdrawals.get('/withdrawals/pending', requireAuth, asyncHandler(async (req, res) => {
  // TODO: add your own admin check here (e.g., req.user.role === 'admin')
  const { rows } = await query(
    `select w.id, u.telegram_id, u.username, w.tokens, w.points_debited, w.status, w.address, w.created_at
     from withdrawals w
     join users u on u.id = w.user_id
     where w.status = 'pending'
     order by w.created_at desc
     limit 200`
  );
  res.json({ items: rows });
})); // Separate read endpoint for queues is standard REST routing. [web:2974]

// Approve (finalize) a pending request (admin)
const zApprove = z.object({ tx_hash: z.string().max(100).optional() });
withdrawals.post('/withdrawals/:id/approve', requireAuth, asyncHandler(async (req, res) => {
  // TODO: admin guard here
  const id = Number(req.params.id);
  z.number().int().positive().parse(id);
  zApprove.parse(req.body || {}); // tx hash optional for audit

  await query('begin');
  const { rows: [w] } = await query(
    `select id, user_id, tokens, points_debited, status from withdrawals where id=$1 for update`,
    [id]
  ); // Row lock to ensure single action. [web:3042][web:3039]
  if (!w) { await query('rollback'); return res.status(404).json({ error: 'not_found' }); }
  if (w.status !== 'pending') { await query('rollback'); return res.status(400).json({ error: 'not_pending' }); }

  const { rows: [updated] } = await query(
    `update withdrawals set status='approved', updated_at = now()
     where id=$1 returning id, status, updated_at`,
    [id]
  );

  await query('commit');
  res.json({ ok: true, withdrawal: updated });
})); // Points were already debited at request time; approval only finalizes. [web:2974]

// Reject (refund) a pending request (admin)
const zReject = z.object({ reason: z.string().max(200).optional() });
withdrawals.post('/withdrawals/:id/reject', requireAuth, asyncHandler(async (req, res) => {
  // TODO: admin guard here
  const id = Number(req.params.id);
  z.number().int().positive().parse(id);
  const { reason } = zReject.parse(req.body || {});

  await query('begin');
  const { rows: [w] } = await query(
    `select id, user_id, tokens, points_debited, status from withdrawals where id=$1 for update`,
    [id]
  ); // Locked row avoids double-processing. [web:3042][web:3039]
  if (!w) { await query('rollback'); return res.status(404).json({ error: 'not_found' }); }
  if (w.status !== 'pending') { await query('rollback'); return res.status(400).json({ error: 'not_pending' }); }

  // Refund points and write reversing ledger entry
  await query('update users set points = points + $1 where id=$2', [w.points_debited, w.user_id]);
  await query(
    "insert into events(user_id, type, points, meta) values ($1, 'task', $2, $3)",
    [w.user_id, w.points_debited, { reason: 'withdraw_reject', withdrawal_id: w.id, note: reason }]
  );

  const { rows: [updated] } = await query(
    `update withdrawals set status='rejected', updated_at=now()
     where id=$1 returning id, status, updated_at`,
    [id]
  );

  await query('commit');
  res.json({ ok: true, withdrawal: updated, refunded_points: w.points_debited });
}));
