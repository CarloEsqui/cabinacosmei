CREATE TABLE `hallazgos_estado` (
	`id` text PRIMARY KEY NOT NULL,
	`clave` text NOT NULL,
	`hallazgo_id` text NOT NULL,
	`fecha_desde` text NOT NULL,
	`fecha_hasta` text NOT NULL,
	`estado` text NOT NULL,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hallazgos_estado_clave_unique` ON `hallazgos_estado` (`clave`);
