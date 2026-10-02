-- Reply-To address for outgoing emails (e.g. owner notifications reply to the guest).
ALTER TABLE emails ADD COLUMN reply_to text;
