import { query } from '../db.js';

export const RATIO = 100;     // 100 points = 1 token
export const MIN_TOKENS = 10; // minimum withdrawal

/**
 * Create a withdrawal request:
 * - validates integer tokens ≥ MIN_TOKENS
 * - debits points = tokens * RATIO atomically
 * - writes a negative events entry (hold)
 * - inserts a withdrawals row with status='pending'
 */
export async function createWithdrawal(userId, tokensRequested, address = null) {
  // Validate basic inputs up front
  if (!Number.isInteger(tokensRequested) || tokensRequested < MIN_TOKENS) {
    return { ok: false, error: 'MIN_WITHDRAWAL_10_TOKENS' };
  }
  const pointsNeeded = tokensRequested * RATIO;

  try {
    await query('begin');

    // Lock user row to prevent concurrent overdrafts
    const { rows: [u] } = await query(
      'select id, points from users where id=$1 for update',
      [userId]
    ); // Row-level lock prevents concurrent read-modify-write races. [web:3042][web:3094]
    if (!u) {
      await query('rollback');
      return { ok: false, error: 'USER_NOT_FOUND' };
    }

    if (u.points < pointsNeeded) {
      await query('rollback');
      return { ok: false, error: 'INSUFFICIENT_POINTS', required: pointsNeeded, have: u.points };
    }

    // Deduct balance (hold) and write an auditable ledger entry
    await query('update users set points = points - $1 where id=$2', [pointsNeeded, userId]);
    await query(
      "insert into events(user_id, type, points, meta) values ($1, 'task', $2, $3)",
      [userId, -pointsNeeded, { reason: 'withdraw_request', tokens: tokensRequested, address }]
    );

    // Persist pending withdrawal (manual processing later)
    const { rows: [w] } = await query(
      `insert into withdrawals(user_id, tokens, points_debited, status, address)
       values ($1,$2,$3,'pending',$4)
       returning id, user_id, tokens, points_debited, status, address, created_at`,
      [userId, tokensRequested, pointsNeeded, address]
    );

    await query('commit');
    return { ok: true, withdrawal: w };
  } catch (e) {
    try { await query('rollback'); } catch {}
    return { ok: false, error: 'TX_FAILED' };
  }
}
