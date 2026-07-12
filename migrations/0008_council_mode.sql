-- Council mode: allow a second resident to participate in a conversation
-- guest_connection_id: the invited second model (nullable — opt-in per conversation)
ALTER TABLE conversations ADD COLUMN guest_connection_id text;
