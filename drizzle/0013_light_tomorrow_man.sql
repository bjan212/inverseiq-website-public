CREATE TABLE `activeTrades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`signalId` int,
	`symbol` varchar(32) NOT NULL,
	`direction` enum('LONG','SHORT') NOT NULL,
	`entryPrice` text NOT NULL,
	`takeProfit` text NOT NULL,
	`stopLoss` text NOT NULL,
	`takeProfit2` text,
	`exchange` varchar(32),
	`status` enum('open','closed_tp','closed_sl','closed_manual','expired') NOT NULL DEFAULT 'open',
	`currentPnlPct` text,
	`lastPrice` text,
	`lastCheckedAt` timestamp,
	`warningsSent` int NOT NULL DEFAULT 0,
	`slWarned` int NOT NULL DEFAULT 0,
	`closedPrice` text,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activeTrades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertType` enum('flash_crash','volatility_spike','funding_extreme','liquidation_cascade','whale_movement') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`affectedSymbols` text,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `marketAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegramSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chatId` varchar(32) NOT NULL,
	`username` varchar(64),
	`isActive` int NOT NULL DEFAULT 1,
	`alertOnSlApproach` int NOT NULL DEFAULT 1,
	`alertOnTpHit` int NOT NULL DEFAULT 1,
	`alertOnMarketWarning` int NOT NULL DEFAULT 1,
	`alertOnHighConfSignal` int NOT NULL DEFAULT 0,
	`verificationCode` varchar(16),
	`isVerified` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegramSettings_id` PRIMARY KEY(`id`)
);
