CREATE TABLE `trading_scenario_directions` (
	`id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`ruleId` varchar(100) NOT NULL,
	`payload` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_scenario_directions_id` PRIMARY KEY(`id`),
	CONSTRAINT `scenario_direction_owner_rule` UNIQUE(`userId`,`ruleId`)
);
