import { query } from '../db.js';
import { POINTS } from './points.js';

export async function upsertUser(telegram_id, username = null) {
  const { rows: [u] } = await query(
    `insert into users(telegram_id, username) values($1,$2)
     on conflict (telegram_id) do update set username = coalesce(excluded.username, users.username)
     returning *`,
    [telegram_id, username]
  );
  return u;
}

export async function awardReferral(inviter_tid, invitee_tid) {
  const inviter = await upsertUser(inviter_tid);
  const invitee = await upsertUser(invitee_tid);

  if (inviter.id === invitee.id) return { ok: false, reason: 'SELF_INVITE' };

  const { rows: [inv] } = await query('select referred_by, referral_claimed from users where id=$1', [invitee.id]);
  if (inv?.referred_by) return { ok: false, reason: 'ALREADY_REFERRED' };

  try {
    await query('begin');

    // Set referred_by only if unset
    const { rowCount: setRef } = await query(
      'update users set referred_by=$1 where id=$2 and referred_by is null',
      [inviter.id, invitee.id]
    );
    if (setRef === 0) { await query('rollback'); return { ok: false, reason: 'ALREADY_REFERRED' }; }

    // Award inviter once
    await query('update users set points = points + $1 where id=$2', [POINTS.INVITE_GIVER, inviter.id]);
    await query(
      "insert into events(user_id, type, points, meta) values ($1, 'ref_bonus', $2, $3)",
      [inviter.id, POINTS.INVITE_GIVER, { invitee_tid }]
    );

    // Award invitee one-time 20 pts if not yet claimed
    const { rowCount: rc2 } = await query(
      'update users set points = points + $1, referral_claimed=true where id=$2 and referral_claimed=false',
      [POINTS.INVITE_RECEIVER, invitee.id]
    );
    if (rc2 > 0) {
      await query(
        "insert into events(user_id, type, points, meta) values ($1, 'ref_bonus', $2, $3)",
        [invitee.id, POINTS.INVITE_RECEIVER, { inviter_tid }]
      );
    }

    await query('commit');
    return { ok: true, inviter_id: inviter.id, invitee_id: invitee.id };
  } catch (e) {
    await query('rollback');
    return { ok: false, reason: 'TX_FAIL' };
  }
}
