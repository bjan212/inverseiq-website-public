CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320),
	`phone` varchar(20),
	`enableBrowser` int NOT NULL DEFAULT 1,
	`enableEmail` int NOT NULL DEFAULT 0,
	`enableSMS` int NOT NULL DEFAULT 0,
	`notifyHitTP` int NOT NULL DEFAULT 1,
	`notifyHitSL` int NOT NULL DEFAULT 1,
	`notifyExpired` int NOT NULL DEFAULT 0,
	`notifyVerified` int NOT NULL DEFAULT 1,
	`notifyMarketUpdates` int NOT NULL DEFAULT 1,
	`notifySystem` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`)
);
