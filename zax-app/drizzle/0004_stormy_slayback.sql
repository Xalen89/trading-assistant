CREATE TABLE `trading_market_history` (
	`id` varchar(180) NOT NULL,
	`userId` int NOT NULL,
	`market` varchar(100) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`barTime` varchar(24) NOT NULL,
	`payload` json NOT NULL,
	`source` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_market_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_paper_events` (
	`id` varchar(180) NOT NULL,
	`userId` int NOT NULL,
	`tradeId` varchar(100) NOT NULL,
	`version` int NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_paper_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_paper_proposals` (
	`id` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`market` varchar(100) NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_paper_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_paper_trades` (
	`id` varchar(180) NOT NULL,
	`tradeId` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`version` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_paper_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_setup_snapshots` (
	`id` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`market` varchar(100) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`selectionKey` varchar(128) NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_setup_snapshots_id` PRIMARY KEY(`id`)
);
