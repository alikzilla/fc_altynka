-- Общий таймер текущей игры: JSON с последним состоянием (или меткой сброса). NULL — таймер не запускали.
ALTER TABLE `events` ADD COLUMN `game_timer_json` text;
