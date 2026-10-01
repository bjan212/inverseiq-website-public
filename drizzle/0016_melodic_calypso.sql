ALTER TABLE `gemScanSettings` ADD `minConfidence` int DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `gemScanSettings` ADD `enableEmail` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `gemScanSettings` ADD `enableTelegram` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `gemScanSettings` ADD `enableBrowser` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gemScanSettings` ADD `notifyEmail` varchar(320);