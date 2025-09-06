import { query } from '../db.js';

export const RATIO = 100; // 100 points = 1 token
export const MIN_TOKENS = 10;

export async function createWithdrawal(userId, tokensRequested, address = null) {
  if (!Number.isInteger(tokensRequested) || tokensRequested < MIN_TOKENS) {
    throw new Error('MIN_WITHDRAWAL_10_TOKENS');
  }
  const pointsNeeded = tokensRequested * RATIO;

  try {
    await query('begin');

    // Lock row to prevent concurrent overdrafts
    const { rows: [u] } = await query('select id, points from users where id=$1 for update', [userId]);
    if (!u) throw new Error('USER_NOT_FOUND');

    if (u.points < pointsNeeded) {
      await query('rollback');
      return { ok: false, error: 'INSUFFICIENT_POINTS' };
    }

    // Deduct and record
    await query('update users set points = points - $1 where id=$2', [pointsNeeded, userId]);
    await query(
      "insert into events(user_id, type, points, meta) values ($1, 'task', $2, $3)",
      [userId, -pointsNeeded, { reason: 'withdrawal', tokens: tokensRequested }]
    );
    const { rows: [w] } = await query(
      'insert into withdrawals(user_id, tokens, points_debited, status, address) values ($1,$2,$3,$4,$5) returning *',
      [userId, tokensRequested, pointsNeeded, 'pending', address]
    );

    await query('commit');
    return { ok: true, withdrawal: w };
  } catch (e) {
    try { await query('rollback'); } catch {}
    throw e;
  }
}
