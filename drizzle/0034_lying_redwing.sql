ALTER TABLE `autoTraderSettings` ADD `marginPercent` int DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastAvailableBalance` varchar(32);--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastCalculatedMargin` varchar(32);