ALTER TABLE public.reviews ADD CONSTRAINT reviews_external_user_id_unique UNIQUE (external_user_id);
NOTIFY pgrst, 'reload schema';