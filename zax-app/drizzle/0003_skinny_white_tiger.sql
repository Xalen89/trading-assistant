CREATE TABLE `trading_research_jobs` (
	`id` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`kind` varchar(20) NOT NULL,
	`status` varchar(20) NOT NULL,
	`request` json NOT NULL,
	`result` json,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_research_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_vectors` (
	`id` varchar(180) NOT NULL,
	`userId` int NOT NULL,
	`patternId` varchar(100) NOT NULL,
	`sourceHash` varchar(64) NOT NULL,
	`descriptorVersion` varchar(100) NOT NULL,
	`encryptedVector` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_vectors_id` PRIMARY KEY(`id`)
);
