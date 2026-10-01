ALTER TABLE `autoTraderSettings` ADD `recoveryTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `workerHeartbeatAt` timestamp;--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastWorkerError` varchar(512);--> statement-breakpoint
ALTER TABLE `autoTraderSettings` ADD `lastRecoveryAt` timestamp;