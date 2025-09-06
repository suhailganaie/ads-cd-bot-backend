import { z } from 'zod';

export const zTelegramId = z.string().min(1).max(64);
export const zTaskComplete = z.object({ task_id: z.string().min(1).max(64) });
export const zInviteClaim = z.object({ inviter_tid: zTelegramId });
