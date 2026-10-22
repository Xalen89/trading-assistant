# SGX Full OrderBook Tick Data Trading Strategy — discovery inventory

**20 deduplicated entries** were found in the public `master` source. They comprise **two preprocessing solutions, four offline label/dataset methods, two active model-input feature families, three exploratory feature/analysis methods, one offline classifier-selection pipeline, five implemented model candidates, one incomplete P&L evaluator, and two context-only references.** There are **zero deployable live or paper-execution strategies** in this repository. The README describes ML over high-frequency limit order books, five classifier types, “best model” prediction of the next 10 seconds, and P&L, but it does not expose a trading application or execution layer. [1]

## Coverage and provenance

This inventory is **not a homepage list**. It is based on GitHub’s complete recursive `master` tree, which returned `truncated: false`: **38 paths (27 blobs, 11 directories), 13 notebook paths representing 8 unique notebook blob hashes, 4 CSV paths, 7 PNGs, and 1 text note**. Five checkpoint paths are byte-identical duplicate blobs; the only nonidentical Train/Test checkpoint has the same extracted source apart from an empty-cell position. The complete unique source set, README, data-quality note, and the tiny 3,290-byte transformed-book sample were statically read. The three large repository CSVs were deliberately not downloaded. [2]

The collection’s methodology is a **best-three-level order-book research pipeline**, rather than a full-depth execution system. It reconstructs an event stream into best-three bid/ask snapshots, decodes those snapshots, builds labels and features, tests classifiers, and plots an offline P&L series. The checked-in transformation itself only iterates events up to index 99 in its main update loop, which further identifies it as a prototype. [3] [4]

## Inventory

| Category | Count | Entries / semantic coverage |
|---|---:|---|
| Offline preprocessing solutions | 2 | **Event-stream best-three reconstruction**; **three-level snapshot decoding and session-clock normalization**. [3] [5] |
| Offline labels and dataset methods | 4 | **600-second forward-cross label** used by the builder; distinct **900-second forward-cross prototype**; **UP/DOWN time-session partitions** (not direction signals); **one-second last-event sampling with carry-forward**. [5] [6] |
| Active model-input features | 2 | **30 Ask1 rise ratios** using 6:00 through 20:30 minute lookbacks at 30-second increments; **weighted 3-level ask/bid ratio and imbalance**, two statistics across 17 weight triplets (34 values). [5] |
| Exploratory feature/analysis methods | 3 | **600-second Ask1/Bid1 rise ratios** across selected dates; **50/30/20 weighted depth, Bid/Ask ratio, and spread distributions**; **15-minute future min-ask/max-bid series**. These are research visualizations, not decision rules. [7] |
| Offline strategy selection | 1 | **Rolling CV-selected binary-classifier pipeline**: 1,800 training rows, 10 test/prediction rows, five-fold accuracy grid search. The active loop executes one 10-second window; the longer loop is only commented out. [8] |
| Implemented model candidates | 5 | **RandomForestClassifier**, **ExtraTreesClassifier**, **AdaBoostClassifier** with decision-tree base, **GradientBoostingClassifier**, and **SVC** with RBF/linear alternatives. Exact checked-in grids are in the JSON inventory. [8] |
| Offline evaluator | 1 | **Best-CV-model P&L**: class-1 correct predictions receive 0.2 × column 65; class-1 incorrect predictions use a 600-second column-67 difference. It is incomplete because the displayed builder produces columns 0–64, not the evaluator’s columns 65 and 67. [5] [8] |
| Context/unimplemented | 2 | **LogisticRegression** is imported only, never configured or fit; plotted rise/depth threshold lines never map to trades. They are not strategies. [7] [8] |

The full machine-readable entry set contains URLs, exact readily stated rules/parameters, source URLs, data requirements, accessibility, and deployment status: [`sgx-orderbook.json`](./sgx-orderbook.json).

## Offline labels versus a deployable strategy

The active builder creates a binary label at each one-second point: class 1 when the current best bid is above the minimum best ask in the following **600 seconds**; otherwise class 0. For the last 600 seconds it instead compares current bid with the final ask. This is a future-dependent **offline label**, not a live signal available at that time. The separate depth-exploration notebook has the analogous **900-second** label prototype. [5] [6]

`UP` and `DOWN` do **not** describe opposite long/short strategies. They denote the coded **09:00–11:30** and **13:00–16:00** sessions, respectively, and both use the same label and feature semantics. Model selection loads both, then explicitly assigns the `UP` dataset to the active `data_2014` variable. [5] [8]

The closest thing to a strategy is therefore an **offline classifier-selection experiment**, not a deployable paper strategy. It trains grid-searched candidates on 1,800 rows, predicts a following 10 rows, ranks candidates on five-fold training accuracy, and passes the selected final class prediction to a P&L cell. No source implements a market-data connection, model persistence, live feature service, order or paper-order routing, position/inventory state, costs, slippage, fills, latency handling, risk controls, or an Expo/native app. [8]

## License, data rights, and data notes

**Code license: absent.** Repository metadata reports `license: null`, the complete tree contains no license-named file, and GitHub’s repository-license endpoint returns 404. **Code must be treated as unlicensed; no reuse permission is inferred.** [2] [9]

**Data rights: not stated.** No vendor/exchange data agreement, provenance contract, redistribution permission, or other data-use authorization appears in the README, complete tree, notebooks, or `Data_Problem.txt`. The latter is a Big5-encoded **data-quality log**, not a rights statement. Consequently, the bundled order-book CSV data should be treated as **rights-unknown/unlicensed**. [1] [2] [10]

The data-quality log records timestamp-order anomalies, microsecond corrections affecting `Best Price`/`QuantityDifference`, unreconstructible missing records, manual row deletions, manually filled best price/quantity observations, and another time-order issue. These are recorded facts about the repository’s research data; no independent data-quality validation was performed. [10]

## Notes required for owner-only Expo/native paper-app intake

There is **no native, Expo, web, broker, paper-execution, or user-session code** in the complete tree. This discovery record should be treated as a source inventory only. The JSON flags entries that are formula-accessible but offline and identifies the P&L evaluator, LogisticRegression import, and chart thresholds as incomplete/context-only rather than app-ready strategies.

**References**

[1]: https://github.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy "Repository page and README rendering"
[2]: https://api.github.com/repos/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/git/trees/master?recursive=1 "Complete recursive master tree"
[3]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Data_Transformation/order%20book%20data/Data_Transformation_Code.ipynb "Order-book transformation notebook"
[4]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Data_Transformation/order%20book%20data/order_book_3_2014_1_2.csv "Tiny transformed order-book sample"
[5]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Data_Transformation/Train_Test_Builder/Train_Test_Builder.ipynb "Train/test builder notebook"
[6]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Feature_Selection/Train_Test_Data_Builder_Feature_Depth_Extractor.ipynb "Depth feature and 900-second label notebook"
[7]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Feature_Selection/SGX_A50_Market_Feature.ipynb "Market feature exploration notebook"
[8]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Model_Selection/Model_Selection.ipynb "Model selection and P&L notebook"
[9]: https://api.github.com/repos/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy "Repository metadata with license null"
[10]: https://raw.githubusercontent.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy/master/Data_Transformation/Data_Problem.txt "Repository data-quality notes"
