CREATE TABLE `hyperliquidKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedPrivateKey` text NOT NULL,
	`walletAddress` varchar(42) NOT NULL,
	`label` varchar(64) DEFAULT 'My Hyperliquid Wallet',
	`isActive` int NOT NULL DEFAULT 1,
	`lastVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hyperliquidKeys_id` PRIMARY KEY(`id`)
);
