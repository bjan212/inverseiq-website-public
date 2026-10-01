CREATE TABLE `userSymbolPatterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`tradeCount` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`winRate` int NOT NULL DEFAULT 0,
	`avgPnlCents` int NOT NULL DEFAULT 0,
	`totalPnlCents` int NOT NULL DEFAULT 0,
	`dominantSide` varchar(8) NOT NULL DEFAULT 'MIXED',
	`bias` varchar(16) NOT NULL DEFAULT 'NEUTRAL',
	`confidenceAdjustment` int NOT NULL DEFAULT 0,
	`action` varchar(16) NOT NULL DEFAULT 'NEUTRAL',
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSymbolPatterns_id` PRIMARY KEY(`id`)
);
