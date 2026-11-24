-- Когда человек удалил свои данные (профиль обезличен, tg_id = -id). NULL — действующий профиль.
ALTER TABLE `users` ADD COLUMN `deleted_at` integer;
