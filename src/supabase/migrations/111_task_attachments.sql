-- Persist task attachments from Customer/Contact detail task logging.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
