ALTER TABLE `signalHistory` ADD `tradeTaken` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `signalHistory` ADD `tradeTakenAt` timestamp;--> statement-breakpoint
ALTER TABLE `signalHistory` ADD `tradeTakenExchange` varchar(32);--> statement-breakpoint
ALTER TABLE `signalHistory` ADD `tradeVerified` int DEFAULT 0 NOT NULL;