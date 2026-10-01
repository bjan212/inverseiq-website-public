CREATE TABLE `signalHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`direction` enum('LONG','SHORT') NOT NULL,
	`strategy` varchar(64) NOT NULL,
	`entryPrice` text NOT NULL,
	`stopLoss` text NOT NULL,
	`takeProfit` text NOT NULL,
	`confidence` int NOT NULL,
	`riskRewardRatio` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`outcome` enum('pending','hit_tp','hit_sl','expired') NOT NULL DEFAULT 'pending',
	`outcomeAt` timestamp,
	`actualExitPrice` text,
	`metadata` text,
	CONSTRAINT `signalHistory_id` PRIMARY KEY(`id`)
);
