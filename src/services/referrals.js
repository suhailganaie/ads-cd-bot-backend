// services/referrals.js
import { query } from '../db.js';
import { POINTS } from './points.js';

/**
 * Upsert a user by telegram_id, updating username if provided.
 */
export async function upsertUser(telegram_id, username = null) {
  const { rows: [u] } = await query(
    `insert into users(telegram_id, username) values($1,$2)
     on conflict (telegram_id)
     do update set username = coalesce(excluded.username, users.username)
     returning *`,
    [telegram_id, username]
  );
  return u;
}

/**
 * Persist the inviter -> invitee relation exactly once (unique invitee).
 * Also award inviter and (optionally) invitee points and write events.
 */
export async function awardReferral(inviter_tid, invitee_tid) {
  const inviter = await upsertUser(inviter_tid);
  const invitee = await upsertUser(invitee_tid);

  if (inviter.id === invitee.id) return { ok: false, reason: 'SELF_INVITE' };

  // Quick check if invitee already referred
  const { rows: [inv] } = await query(
    'select referred_by, referral_claimed from users where id=$1',
    [invitee.id]
  );
  if (inv?.referred_by) return { ok: false, reason: 'ALREADY_REFERRED' };

  try {
    await query('begin');

    // Assign referred_by once
    const { rowCount: setRef } = await query(
      'update users set referred_by=$1 where id=$2 and referred_by is null',
      [inviter.id, invitee.id]
    );
    if (setRef === 0) { await query('rollback'); return { ok: false, reason: 'ALREADY_REFERRED' }; }

    // Insert referrals row; unique(invitee_id) enforces one-time attribution
    await query(
      'insert into referrals(inviter_id, invitee_id) values($1,$2) on conflict (invitee_id) do nothing',
      [inviter.id, invitee.id]
    );

    // Award inviter once
    await query('update users set points = points + $1 where id=$2', [POINTS.INVITE_GIVER, inviter.id]);
    await query(
      "insert into events(user_id, type, points, meta) values ($1, 'ref_bonus', $2, $3)",
      [inviter.id, POINTS.INVITE_GIVER, { invitee_tid }]
    );

    // Award invitee once if not yet claimed
    const { rowCount: rc2 } = await query(
      'update users set points = points + $1, referral_claimed=true where id=$2 and referral_claimed=false',
      [POINTS.INVITE_RECEIVER, invitee.id]
    );
    if (rc2 > 0) {
      await query(
        "insert into events(user_id, type, points, meta) values ($1, 'ref_bonus', $2, $3)",
        [invitee.id, POINTS.INVITE_RECEIVER, { inviter_tid: inviter_tid }]
      );
    }

    await query('commit');
    return { ok: true, inviter_id: inviter.id, invitee_id: invitee.id };
  } catch (e) {
    await query('rollback');
    return { ok: false, reason: 'TX_FAIL' };
  }
}

/**
 * Return the total number of unique invitees attributed to a given inviter_tid.
 */
export async function getInviteCountByTid(inviter_tid) {
  // Resolve inviter user id
  const { rows: [u] } = await query('select id from users where telegram_id = $1', [inviter_tid]);
  if (!u) return 0;

  // Count via referrals table (indexed by inviter_id)
  const { rows: [r] } = await query(
    'select count(*)::int as count from referrals where inviter_id = $1',
    [u.id]
  );
  return r?.count ?? 0;
}
