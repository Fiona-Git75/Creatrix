-- Per-resident context window override for Ollama (num_ctx in the options block).
-- NULL means "use the model default" (Ollama currently defaults to 4096).
ALTER TABLE connections ADD COLUMN num_ctx integer;
