ALTER TABLE `autoTraderSettings` ADD `lastScanAt` timestamp;--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastScanSymbol` varchar(32);--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastScanCount` int;--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastScanBest` varchar(128);