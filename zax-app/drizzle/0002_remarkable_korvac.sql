CREATE TABLE `trading_reference_versions` (
	`id` varchar(180) NOT NULL,
	`userId` int NOT NULL,
	`patternId` varchar(100) NOT NULL,
	`version` int NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_reference_versions_id` PRIMARY KEY(`id`)
);
