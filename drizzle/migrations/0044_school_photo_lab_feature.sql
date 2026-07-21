-- Photo lab becomes a metered school feature so usage carries school_id.
-- ALTER TYPE ... ADD VALUE may not be used in the same transaction that adds
-- it, so this migration deliberately contains nothing else.
ALTER TYPE "school_feature" ADD VALUE IF NOT EXISTS 'photo_lab';
