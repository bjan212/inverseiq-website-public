CREATE TABLE `userPatterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`patternType` enum('LONG_FAILURE','SHORT_FAILURE','FOMO_ENTRY','PANIC_SELL') NOT NULL,
	`confidence` int NOT NULL,
	`description` text NOT NULL,
	`action` varchar(32) NOT NULL,
	`tradeCount` int NOT NULL DEFAULT 0,
	`totalWins` int NOT NULL DEFAULT 0,
	`totalLosses` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPatterns_id` PRIMARY KEY(`id`)
);
