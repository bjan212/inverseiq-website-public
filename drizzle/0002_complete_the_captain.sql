CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('signal_verified','signal_hit_tp','signal_hit_sl','signal_expired','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`signalId` int,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`metadata` text,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
