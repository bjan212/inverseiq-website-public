CREATE TABLE `cexApiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`exchange` varchar(16) NOT NULL,
	`apiKey` text NOT NULL,
	`apiSecret` text NOT NULL,
	`passphrase` text,
	`label` varchar(64) DEFAULT 'My API Key',
	`isActive` int NOT NULL DEFAULT 1,
	`isTestnet` int NOT NULL DEFAULT 0,
	`lastVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cexApiKeys_id` PRIMARY KEY(`id`)
);
