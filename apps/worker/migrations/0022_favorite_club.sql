-- Любимый клуб игрока (id из каталога @altynka/core). NULL — не выбран; без CHECK, чтобы новые клубы не требовали миграций.
ALTER TABLE `users` ADD COLUMN `favorite_club` text;
