import { z } from 'zod';

export const AssignItemsToCategoryRequestSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1),
});

