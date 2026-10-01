CREATE TABLE `feedbackOutbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`direction` enum('LONG','SHORT') NOT NULL,
	`entryPrice` text NOT NULL,
	`exitPrice` text NOT NULL,
	`outcome` enum('win','loss') NOT NULL,
	`confidence` int NOT NULL,
	`strategy` varchar(64) NOT NULL,
	`status` enum('pending','delivered') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`deliveredAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedbackOutbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `feedbackOutbox_signal_unique` UNIQUE(`signalId`)
);
