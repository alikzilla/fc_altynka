-- Данные карточек поста «Церемония»; у остальных постов пусто.
ALTER TABLE `feed_posts` ADD COLUMN `payload_json` text;
