
DROP POLICY IF EXISTS "Anyone create contact message" ON public.contact_messages;
CREATE POLICY "Anyone create contact message" ON public.contact_messages
  FOR INSERT
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 200
    AND char_length(email) BETWEEN 3 AND 320
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND char_length(message) BETWEEN 1 AND 5000
    AND is_read IS NOT TRUE
  );
