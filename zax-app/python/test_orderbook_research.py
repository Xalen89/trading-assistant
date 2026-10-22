import copy
import math
import unittest
from typing import Any

import orderbook_research as worker


def artificial_book_fixture(n: int = 4000) -> dict[str, Any]:
    '''Artificial unit fixture only. It is not market data or performance evidence.''' 
    start = 1_700_000_000.0
    snapshots = []
    for index in range(n):
        mid = 100.0 + math.sin(index / 31.0) * 1.5 + math.sin(index / 7.0) * 0.1
        bid, ask = mid - 0.05, mid + 0.05
        snapshots.append({
            'time': start + index,
            'bids': [
                {'price': bid, 'quantity': 100.0},
                {'price': bid - 0.01, 'quantity': 90.0},
                {'price': bid - 0.02, 'quantity': 80.0},
            ],
            'asks': [
                {'price': ask, 'quantity': 110.0},
                {'price': ask + 0.01, 'quantity': 95.0},
                {'price': ask + 0.02, 'quantity': 85.0},
            ],
        })
    return {
        'instrument': 'ARTIFICIAL UNIT BOOK ONLY',
        'source': 'Synthetic unit-test fixture; not source market data',
        'rightsConfirmed': True,
        'snapshots': snapshots,
        'spec': {'horizonSeconds': 600, 'trainingSeconds': 1800, 'testSeconds': 10, 'maxFolds': 2},
    }


class OrderBookResearchTests(unittest.TestCase):
    def validated(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return worker.validate_payload(artificial_book_fixture())

    def test_feature_prefix_causality(self) -> None:
        snapshots, _ = self.validated()
        target_time = snapshots[2000]['time']
        before = next(row['features'] for row in worker.build_feature_rows(snapshots) if row['time'] == target_time)
        changed = copy.deepcopy(artificial_book_fixture())
        for snapshot in changed['snapshots'][2001:]:
            for level in snapshot['asks']:
                level['price'] += 25.0
        changed_snapshots, _ = worker.validate_payload(changed)
        after = next(row['features'] for row in worker.build_feature_rows(changed_snapshots) if row['time'] == target_time)
        self.assertEqual(before, after)

    def test_future_label_tail_purge(self) -> None:
        snapshots, _ = self.validated()
        feature_rows = worker.build_feature_rows(snapshots)
        labelled = worker.attach_future_labels(feature_rows, snapshots, 600)
        last_time = snapshots[-1]['time']
        self.assertTrue(labelled)
        self.assertTrue(all(row['labelEnd'] <= last_time for row in labelled))
        self.assertTrue(all(row['time'] <= last_time - 600 for row in labelled))
        labelled_times = {row['time'] for row in labelled}
        self.assertTrue(all(row['time'] not in labelled_times for row in feature_rows if row['time'] > last_time - 600))

    def test_book_invalid_order(self) -> None:
        payload = artificial_book_fixture()
        payload['snapshots'][10]['bids'][1]['price'] = payload['snapshots'][10]['bids'][0]['price'] + 1.0
        with self.assertRaisesRegex(worker.ContractError, 'strictly descending'):
            worker.validate_payload(payload)

    def test_chronology_rejected(self) -> None:
        payload = artificial_book_fixture()
        payload['snapshots'][4]['time'] = payload['snapshots'][3]['time']
        with self.assertRaisesRegex(worker.ContractError, 'strictly increasing'):
            worker.validate_payload(payload)

    def test_no_feature_global_impute(self) -> None:
        payload = artificial_book_fixture()
        payload['snapshots'][200]['bids'][1]['quantity'] = 0.0
        with self.assertRaisesRegex(worker.ContractError, 'undefined weighted depth'):
            worker.validate_payload(payload)

    def test_heldout_no_leak_and_purge(self) -> None:
        snapshots, metadata = self.validated()
        labelled = worker.attach_future_labels(worker.build_feature_rows(snapshots), snapshots, 600)
        folds = worker.build_outer_folds(labelled, metadata['spec'])
        self.assertTrue(folds)
        for fold in folds:
            self.assertTrue(all(row['labelEnd'] < fold['start'] for row in fold['training']))
            self.assertTrue(all(fold['start'] <= row['time'] < fold['end'] for row in fold['testing']))
            self.assertGreater(fold['purgedRows'], 0)
        changed = copy.deepcopy(labelled)
        first = folds[0]
        for row in changed:
            if first['start'] <= row['time'] < first['end']:
                row['label'] = 1 - row['label']
        changed_folds = worker.build_outer_folds(changed, metadata['spec'])
        self.assertEqual([(f['start'], f['end'], f['purgedRows']) for f in folds],
                         [(f['start'], f['end'], f['purgedRows']) for f in changed_folds])

    def test_parent_report_contract_and_no_probability(self) -> None:
        report = worker.run(artificial_book_fixture())
        for key in ('kind', 'engine', 'instrument', 'source', 'generatedAt', 'snapshots', 'featureRows', 'features', 'horizonSeconds', 'models', 'limitations', 'probability'):
            self.assertIn(key, report)
        self.assertEqual(report['kind'], 'orderbook-ml')
        self.assertEqual(report['features'], 64)
        self.assertIsNone(report['probability'])
        self.assertEqual({item['name'] for item in report['models']},
                         {'randomForest', 'extraTrees', 'adaBoostTree', 'gradientBoosting', 'svc-rbf', 'svc-linear'})
        self.assertNotIn('featureValues', report)
        for item in report['models']:
            self.assertIn(item['status'], ('complete', 'skipped'))
            self.assertIn('configuration', item)
            self.assertTrue(item['configuration'])
            for fold in item['folds']:
                self.assertIn('confusion', fold)
                self.assertIn('baselineAccuracy', fold)
                self.assertIn('metricScope', fold)
                self.assertIn('testWindowExclusiveEnd', fold)

    def test_ohlc_is_not_accepted(self) -> None:
        payload = artificial_book_fixture()
        payload['snapshots'][0]['close'] = 100.0
        with self.assertRaisesRegex(worker.ContractError, 'OHLC'):
            worker.validate_payload(payload)


if __name__ == '__main__':
    unittest.main()
