-- The typing card's big replay button ("play the word" under the answer).
-- Early on it is a legitimate part of learning the word; past this stage it
-- would let a typed answer be dictated straight off the audio, so it only
-- reappears once the answer is checked. Same shape and default (14 days) as
-- `memory_hook_disable_from_stage`.
ALTER TABLE "users"
  ADD COLUMN "typing_audio_replay_hide_from_stage" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
