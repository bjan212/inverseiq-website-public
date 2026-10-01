CREATE TABLE `predictionHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`side` enum('long','short') NOT NULL,
	`entryPrice` text NOT NULL,
	`leverage` int NOT NULL DEFAULT 1,
	`verdict` varchar(8) NOT NULL,
	`probability` int NOT NULL DEFAULT 0,
	`confidence` varchar(8) NOT NULL,
	`keyReason` text,
	`suggestedAction` varchar(16),
	`currentPrice` text,
	`pnlPct` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictionHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scanHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scanType` enum('single','best') NOT NULL DEFAULT 'single',
	`symbol` varchar(32) NOT NULL,
	`direction` enum('LONG','SHORT') NOT NULL,
	`confidence` varchar(8) NOT NULL,
	`entryPrice` text,
	`tp1` text,
	`tp2` text,
	`sl` text,
	`riskReward` text,
	`isBadEntry` int NOT NULL DEFAULT 0,
	`currentPrice` text,
	`analysis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scanHistory_id` PRIMARY KEY(`id`)
);
