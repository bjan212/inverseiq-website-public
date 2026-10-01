CREATE TABLE `confidenceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`avgConfidence` int NOT NULL,
	`totalSignals` int NOT NULL,
	`hitTP` int NOT NULL DEFAULT 0,
	`hitSL` int NOT NULL DEFAULT 0,
	`expired` int NOT NULL DEFAULT 0,
	`winRate` int NOT NULL DEFAULT 0,
	`backendPatterns` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `confidenceHistory_id` PRIMARY KEY(`id`)
);
