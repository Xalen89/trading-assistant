CREATE TABLE `trading_alert_events` (
	`id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`ruleId` varchar(100) NOT NULL,
	`payload` json NOT NULL,
	`delivery` varchar(32) NOT NULL DEFAULT 'pending',
	`receiptId` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_alert_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(256) NOT NULL,
	`platform` varchar(12) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `trading_device_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `trading_schedules` (
	`taskUid` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_schedules_taskUid` PRIMARY KEY(`taskUid`)
);
--> statement-breakpoint
CREATE TABLE `trading_sources` (
	`id` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`objectKey` varchar(512) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`filename` varchar(256) NOT NULL,
	`metadata` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_workspaces` (
	`userId` int NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`payload` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_workspaces_userId` PRIMARY KEY(`userId`)
);
