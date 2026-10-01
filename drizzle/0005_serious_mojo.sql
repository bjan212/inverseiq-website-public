CREATE TABLE `binanceApiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiKey` text NOT NULL,
	`apiSecret` text NOT NULL,
	`label` varchar(64) DEFAULT 'My Binance API',
	`isActive` int NOT NULL DEFAULT 1,
	`isTestnet` int NOT NULL DEFAULT 0,
	`lastVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `binanceApiKeys_id` PRIMARY KEY(`id`)
);
