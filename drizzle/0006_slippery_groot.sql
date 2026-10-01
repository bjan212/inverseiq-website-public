CREATE TABLE `gemWatchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`exchange` varchar(32) NOT NULL,
	`riskLevel` enum('VERY_HIGH','HIGH','MEDIUM','LOW') NOT NULL,
	`gemScore` int NOT NULL,
	`alertEnabled` int NOT NULL DEFAULT 0,
	`priceAtAdd` text,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gemWatchlist_id` PRIMARY KEY(`id`)
);
