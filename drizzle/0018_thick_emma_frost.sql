CREATE TABLE `mlModelState` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` varchar(64) NOT NULL,
	`modelData` text NOT NULL,
	`accuracy` int NOT NULL DEFAULT 0,
	`trainingSamples` int NOT NULL DEFAULT 0,
	`featureImportance` text,
	`trainingWindowStart` timestamp,
	`trainingWindowEnd` timestamp,
	`trainedAt` timestamp NOT NULL DEFAULT (now()),
	`version` int NOT NULL DEFAULT 1,
	CONSTRAINT `mlModelState_id` PRIMARY KEY(`id`)
);
