import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { auth } from '../middleware/auth.js';
import { query } from '../db.js';
import { POINTS } from '../services/points.js';
import { zTaskComplete } from '../services/validators.js';

export const tasks = Router();

tasks.post('/tasks/complete', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const body = zTaskComplete.parse(req.body || {});
  try {
    await query('begin');
    await query(
      "insert into events(user_id, type, points, meta) values ($1,'task',$2,$3)",
      [req.user.id, POINTS.TASK, { task_id: body.task_id }]
    );
    await query('update users set points = points + $1 where id = $2', [POINTS.TASK, req.user.id]);
    await query('commit');
    res.json({ ok: true, points_added: POINTS.TASK });
  } catch (e) {
    await query('rollback');
    res.status(409).json({ ok: false, error: 'TASK_ALREADY_COMPLETED' });
  }
}));
