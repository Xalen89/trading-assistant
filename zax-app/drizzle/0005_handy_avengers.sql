CREATE INDEX `market_tape_owner_tf_time` ON `trading_market_history` (`userId`,`market`,`timeframe`,`barTime`);--> statement-breakpoint
CREATE INDEX `paper_owner_trade_version` ON `trading_paper_events` (`userId`,`tradeId`,`version`);--> statement-breakpoint
CREATE INDEX `paper_owner_status_time` ON `trading_paper_trades` (`userId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `setup_owner_selection_time` ON `trading_setup_snapshots` (`userId`,`selectionKey`,`createdAt`);