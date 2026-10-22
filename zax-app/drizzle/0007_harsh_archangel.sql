CREATE TABLE `trading_runtime_state` (
	`id` varchar(180) NOT NULL,
	`userId` int NOT NULL,
	`kind` varchar(32) NOT NULL,
	`payload` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_runtime_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `runtime_owner_kind_updated` ON `trading_runtime_state` (`userId`,`kind`,`updatedAt`);