ALTER TABLE `productos` ADD `contenido_cantidad` real;--> statement-breakpoint
ALTER TABLE `productos` ADD `contenido_unidad` text;--> statement-breakpoint
ALTER TABLE `productos` ADD `modo_consumo` text DEFAULT 'pieza' NOT NULL;