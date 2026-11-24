-- Сбои продакшена для алертов администратору: крон раз в 5 минут присылает сводку новых записей.
CREATE TABLE `ops_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ops_incidents_at` ON `ops_incidents` (`at`);
--> statement-breakpoint
-- Служебные отметки: до какой записи уже отправлен алерт, когда последний раз отработал крон и т. п.
CREATE TABLE `ops_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
