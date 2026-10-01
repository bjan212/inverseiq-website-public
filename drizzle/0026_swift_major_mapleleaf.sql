ALTER TABLE `userSettings` ADD `asterBalanceAlertEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `userSettings` ADD `asterBalanceAlertFloor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `userSettings` ADD `asterBalanceAlertLastNotifiedAt` timestamp;