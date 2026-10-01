ALTER TABLE `autoTraderHistory` ADD `initialStopLoss` varchar(32);--> statement-breakpoint
ALTER TABLE `autoTraderHistory` ADD `trailingStopActive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `autoTraderHistory` ADD `trailingStopUpdatedAt` timestamp;