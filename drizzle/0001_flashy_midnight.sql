CREATE TABLE `cortes` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`hora` text NOT NULL,
	`desglose_por_metodo_json` text NOT NULL,
	`total` real NOT NULL,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
