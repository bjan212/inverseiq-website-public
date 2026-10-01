ALTER TABLE `telegramSettings` ADD `highConfMinConfidence` int DEFAULT 95 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegramSettings` ADD `highConfAlertIntervalMinutes` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegramSettings` ADD `lastHighConfAlertAt` timestamp;