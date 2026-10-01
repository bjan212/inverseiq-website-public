CREATE TABLE `discoveredGems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`exchange` varchar(32) NOT NULL,
	`price` text NOT NULL,
	`priceChange24h` text NOT NULL,
	`priceChange7d` text,
	`volume24h` text NOT NULL,
	`dipDepth` text NOT NULL,
	`recoveryMomentum` int NOT NULL,
	`volumeSpike` text NOT NULL,
	`liquidityScore` int NOT NULL,
	`gemScore` int NOT NULL,
	`riskLevel` enum('VERY_HIGH','HIGH','MEDIUM','LOW') NOT NULL,
	`reason` text NOT NULL,
	`entryZoneLow` text NOT NULL,
	`entryZoneHigh` text NOT NULL,
	`targetPrice` text NOT NULL,
	`stopLoss` text NOT NULL,
	`potentialGain` text NOT NULL,
	`tags` text NOT NULL,
	`notificationSent` int NOT NULL DEFAULT 0,
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discoveredGems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gemScanSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 1,
	`scanIntervalMinutes` int NOT NULL DEFAULT 60,
	`scheduleCronTaskUid` varchar(65),
	`telegramChatId` varchar(64),
	`lastScanAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gemScanSettings_id` PRIMARY KEY(`id`)
);
