ALTER TABLE `userPatterns` ADD `source` varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `userSymbolPatterns` ADD `source` varchar(16) DEFAULT 'manual' NOT NULL;