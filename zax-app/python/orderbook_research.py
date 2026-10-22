#!/usr/bin/env python3
"""Offline-only event-time order-book research worker."""

from __future__ import annotations

import bisect
import json
import math
import sys
from collections import deque
from typing import Any, Callable

VERSION = 'orderbook-causal-event-v1'
MAX_INPUT_BYTES = 8 * 1024 * 1024
MIN_SNAPSHOTS, MAX_SNAPSHOTS = 500, 12000
LAGS = tuple(range(360, 1231, 30))
WEIGHTS = (
    ('100', (1, 0, 0)), ('010', (0, 1, 0)), ('001', (0, 0, 1)),
    ('910', (9, 1, 0)), ('820', (8, 2, 0)), ('730', (7, 3, 0)),
    ('640', (6, 4, 0)), ('550', (5, 5, 0)), ('721', (7, 2, 1)),
    ('532', (5, 3, 2)), ('111', (1, 1, 1)), ('190', (1, 9, 0)),
    ('280', (2, 8, 0)), ('370', (3, 7, 0)), ('460', (4, 6, 0)),
    ('127', (1, 2, 7)), ('235', (2, 3, 5)),
)
OHLC_KEYS = {'open', 'high', 'low', 'close', 'candles', 'volume'}


class ContractError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def fail(code: str, message: str) -> None:
    raise ContractError(code, message)


def finite(value: Any, field: str, positive: bool = False, nonnegative: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail('invalid_number', field + ' must be a finite number.')
    value = float(value)
    if not math.isfinite(value):
        fail('invalid_number', field + ' must be a finite number.')
    if positive and value <= 0:
        fail('invalid_number', field + ' must be greater than zero.')
    if nonnegative and value < 0:
        fail('invalid_number', field + ' must be at least zero.')
    return value


def exact_keys(value: Any, keys: set[str], field: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        fail('invalid_schema', field + ' must contain exactly: ' + ', '.join(sorted(keys)) + '.')


def feature_names() -> list[str]:
    return ([f'ask1_pct_change_lag_{lag}s' for lag in LAGS]
            + [f'weighted_ask_bid_ratio_{name}' for name, _ in WEIGHTS]
            + [f'weighted_ask_bid_imbalance_{name}' for name, _ in WEIGHTS])


def validate_payload(payload: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    '''Validate the typed input. No OHLC, reconstruction, filling, or coercion.''' 
    exact_keys(payload, {'instrument', 'source', 'rightsConfirmed', 'snapshots', 'spec'}, 'payload')
    if OHLC_KEYS.intersection(payload):
        fail('ohlc_not_accepted', 'OHLC/candle inputs are not accepted.')
    instrument, source = payload['instrument'], payload['source']
    if not isinstance(instrument, str) or not instrument.strip():
        fail('invalid_metadata', 'instrument must be a non-empty string.')
    if not isinstance(source, str) or not source.strip():
        fail('invalid_metadata', 'source must be a non-empty user-source string.')
    if payload['rightsConfirmed'] is not True:
        fail('rights_not_confirmed', 'rightsConfirmed must be exactly true.')
    spec = payload['spec']
    exact_keys(spec, {'horizonSeconds', 'trainingSeconds', 'testSeconds', 'maxFolds'}, 'spec')
    if isinstance(spec['horizonSeconds'], bool) or not isinstance(spec['horizonSeconds'], int) or spec['horizonSeconds'] not in (600, 900):
        fail('invalid_spec', 'horizonSeconds must be 600 or 900.')
    if (isinstance(spec['trainingSeconds'], bool) or not isinstance(spec['trainingSeconds'], int)
            or isinstance(spec['testSeconds'], bool) or not isinstance(spec['testSeconds'], int)
            or spec['trainingSeconds'] != 1800 or spec['testSeconds'] != 10):
        fail('invalid_spec', 'trainingSeconds and testSeconds must be exactly 1800 and 10.')
    if isinstance(spec['maxFolds'], bool) or not isinstance(spec['maxFolds'], int) or not 1 <= spec['maxFolds'] <= 3:
        fail('invalid_spec', 'maxFolds must be an integer from 1 through 3.')
    raw_rows = payload['snapshots']
    if not isinstance(raw_rows, list) or not MIN_SNAPSHOTS <= len(raw_rows) <= MAX_SNAPSHOTS:
        fail('invalid_snapshot_count', f'snapshots must contain {MIN_SNAPSHOTS} through {MAX_SNAPSHOTS} rows.')
    snapshots: list[dict[str, Any]] = []
    previous_time = -math.inf
    for row_index, raw in enumerate(raw_rows):
        if isinstance(raw, dict) and OHLC_KEYS.intersection(raw):
            fail('ohlc_not_accepted', f'snapshot {row_index} contains an OHLC/candle field.')
        exact_keys(raw, {'time', 'bids', 'asks'}, f'snapshot {row_index}')
        timestamp = finite(raw['time'], f'snapshot {row_index}.time', positive=True)
        if timestamp <= previous_time:
            fail('chronology_error', 'snapshot timestamps must be strictly increasing.')
        previous_time = timestamp
        parsed: dict[str, list[dict[str, float]]] = {}
        for side, descending in (('bids', True), ('asks', False)):
            levels = raw[side]
            if not isinstance(levels, list) or len(levels) != 3:
                fail('invalid_book_levels', f'snapshot {row_index}.{side} must contain exactly three levels.')
            parsed_levels: list[dict[str, float]] = []
            for level_index, level in enumerate(levels):
                exact_keys(level, {'price', 'quantity'}, f'snapshot {row_index}.{side}[{level_index}]')
                parsed_levels.append({
                    'price': finite(level['price'], f'snapshot {row_index}.{side}[{level_index}].price', positive=True),
                    'quantity': finite(level['quantity'], f'snapshot {row_index}.{side}[{level_index}].quantity', nonnegative=True),
                })
            prices = [level['price'] for level in parsed_levels]
            ordered = all(prices[i] > prices[i + 1] for i in range(2)) if descending else all(prices[i] < prices[i + 1] for i in range(2))
            if not ordered:
                direction = 'descending' if descending else 'ascending'
                fail('book_invalid_order', f'snapshot {row_index}.{side} prices must be strictly {direction}.')
            if sum(level['quantity'] for level in parsed_levels) <= 0:
                fail('invalid_book_depth', f'snapshot {row_index}.{side} must have positive aggregated depth.')
            parsed[side] = parsed_levels
        if parsed['bids'][0]['price'] >= parsed['asks'][0]['price']:
            fail('crossed_book', f'snapshot {row_index} is crossed or locked.')
        snapshots.append({'time': timestamp, 'bids': parsed['bids'], 'asks': parsed['asks']})
    validate_weight_denominators(snapshots)
    return snapshots, {'instrument': instrument.strip(), 'source': source.strip(), 'spec': dict(spec)}


def validate_weight_denominators(snapshots: list[dict[str, Any]]) -> None:
    '''Undefined ratios are rejected; zeroes are never mean-filled or globally filled.''' 
    for row_index, row in enumerate(snapshots):
        bids = [x['quantity'] for x in row['bids']]
        asks = [x['quantity'] for x in row['asks']]
        for name, weights in WEIGHTS:
            weighted_bid = sum(weight * quantity for weight, quantity in zip(weights, bids))
            weighted_ask = sum(weight * quantity for weight, quantity in zip(weights, asks))
            if weighted_bid <= 0 or weighted_ask + weighted_bid <= 0:
                fail('zero_quantity_denominator', f'snapshot {row_index} has undefined weighted depth for {name}.')


def build_feature_rows(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    '''Return 64 causal features at actual events only; no feature values are exported.''' 
    times = [row['time'] for row in snapshots]
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(snapshots):
        timestamp = row['time']
        if times[0] > timestamp - LAGS[-1]:
            continue
        current_ask = row['asks'][0]['price']
        rises: list[float] = []
        for lag in LAGS:
            prior_index = bisect.bisect_right(times, timestamp - lag, 0, index + 1) - 1
            if prior_index < 0:
                rises = []
                break
            prior_ask = snapshots[prior_index]['asks'][0]['price']
            rises.append(100.0 * (current_ask - prior_ask) / prior_ask)
        if len(rises) != len(LAGS):
            continue
        bid_quantity = [x['quantity'] for x in row['bids']]
        ask_quantity = [x['quantity'] for x in row['asks']]
        ratios, imbalances = [], []
        for name, weights in WEIGHTS:
            weighted_ask = sum(weight * quantity for weight, quantity in zip(weights, ask_quantity))
            weighted_bid = sum(weight * quantity for weight, quantity in zip(weights, bid_quantity))
            if weighted_bid <= 0 or weighted_ask + weighted_bid <= 0:
                fail('zero_quantity_denominator', f'snapshot {index} has undefined weighted depth for {name}.')
            ratios.append(weighted_ask / weighted_bid)
            imbalances.append((weighted_ask - weighted_bid) / (weighted_ask + weighted_bid))
        vector = rises + ratios + imbalances
        if len(vector) != 64 or not all(math.isfinite(value) for value in vector):
            fail('feature_construction_error', 'expected 64 finite causal feature values.')
        rows.append({'snapshotIndex': index, 'time': timestamp, 'features': vector})
    return rows


def attach_future_labels(feature_rows: list[dict[str, Any]], snapshots: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    '''Attach offline future-window labels and exclude every incomplete label tail.''' 
    times = [row['time'] for row in snapshots]
    future_minimum: dict[int, float] = {}
    minimums: deque[int] = deque()
    right = -1
    for index, row in enumerate(snapshots):
        endpoint = row['time'] + horizon
        while right + 1 < len(snapshots) and times[right + 1] <= endpoint:
            right += 1
            ask = snapshots[right]['asks'][0]['price']
            while minimums and snapshots[minimums[-1]]['asks'][0]['price'] >= ask:
                minimums.pop()
            minimums.append(right)
        while minimums and minimums[0] <= index:
            minimums.popleft()
        # No last-ask fallback: a label requires observations continuing past its endpoint.
        if times[-1] >= endpoint and minimums:
            future_minimum[index] = snapshots[minimums[0]]['asks'][0]['price']
    labelled: list[dict[str, Any]] = []
    for feature_row in feature_rows:
        index = feature_row['snapshotIndex']
        if index not in future_minimum:
            continue
        result = dict(feature_row)
        result['labelEnd'] = feature_row['time'] + horizon
        result['label'] = int(snapshots[index]['bids'][0]['price'] > future_minimum[index])
        labelled.append(result)
    return labelled


def bound_training_rows(rows: list[dict[str, Any]], limit: int = 2500) -> tuple[list[dict[str, Any]], int]:
    '''Deterministically retain chronological coverage without random sampling.''' 
    if len(rows) <= limit:
        return rows, 0
    positions = [round(i * (len(rows) - 1) / (limit - 1)) for i in range(limit)]
    return [rows[position] for position in positions], len(rows) - limit


def build_outer_folds(rows: list[dict[str, Any]], spec: dict[str, Any]) -> list[dict[str, Any]]:
    '''Build event-time outer test windows and purge labels touching their start.''' 
    folds: list[dict[str, Any]] = []
    times = [row['time'] for row in rows]
    label_ends = [row['labelEnd'] for row in rows]
    first_eligible_start = times[0] + spec['trainingSeconds'] if times else math.inf
    next_start = -math.inf
    for candidate_index, candidate in enumerate(rows):
        start = candidate['time']
        if start < first_eligible_start or start < next_start:
            continue
        test_end = start + spec['testSeconds']
        test_stop = bisect.bisect_left(times, test_end, candidate_index)
        prior_start = bisect.bisect_left(times, start - spec['trainingSeconds'], 0, candidate_index)
        train_stop = bisect.bisect_left(label_ends, start, prior_start, candidate_index)
        test_rows = rows[candidate_index:test_stop]
        training = rows[prior_start:train_stop]
        purged_count = candidate_index - train_stop
        if len(training) < 20 or not test_rows:
            continue
        bounded, removed = bound_training_rows(training)
        folds.append({
            'number': len(folds) + 1, 'start': start, 'end': test_end,
            'training': bounded, 'testing': test_rows,
            'trainingBeforeBound': len(training), 'subsampledRows': removed,
            'purgedRows': purged_count, 'priorWindowRows': candidate_index - prior_start,
            'trainWindowStart': start - spec['trainingSeconds'],
        })
        next_start = test_end
        if len(folds) == spec['maxFolds']:
            break
    return folds


def metrics(actual: list[int], predicted: list[int]) -> dict[str, Any]:
    tn = fp = fn = tp = 0
    for truth, estimate in zip(actual, predicted):
        if truth == 0 and estimate == 0:
            tn += 1
        elif truth == 0 and estimate == 1:
            fp += 1
        elif truth == 1 and estimate == 0:
            fn += 1
        else:
            tp += 1
    accuracy = (tn + tp) / len(actual) if actual else None
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    specificity = tn / (tn + fp) if tn + fp else None
    balanced = (recall + specificity) / 2 if recall is not None and specificity is not None else None
    return {'accuracy': accuracy, 'balancedAccuracy': balanced, 'precision': precision,
            'recall': recall, 'confusion': [[tn, fp], [fn, tp]]}


def model_factories() -> dict[str, list[tuple[str, Callable[[], Any], dict[str, Any]]]]:
    '''Five source candidate families, bounded to deterministic fixed specifications.''' 
    from sklearn.ensemble import AdaBoostClassifier, ExtraTreesClassifier, GradientBoostingClassifier, RandomForestClassifier
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import SVC
    from sklearn.tree import DecisionTreeClassifier

    tree_args: dict[str, Any] = dict(criterion='entropy', max_depth=10, min_samples_split=2,
                     min_samples_leaf=3, max_features=None, random_state=0)
    # Installed upstream stubs omit supported None max_features/numeric gamma.
    # These pinned, runtime-tested constructor options are not user-provided kwargs.
    rf_factory: Any = RandomForestClassifier
    extra_factory: Any = ExtraTreesClassifier
    svc_factory: Any = SVC

    def adaboost() -> Any:
        tree = DecisionTreeClassifier(**tree_args)
        return AdaBoostClassifier(estimator=tree, n_estimators=10, random_state=0)

    return {
        'randomForest': [('fixed', lambda: rf_factory(n_estimators=10, max_depth=10,
            min_samples_split=2, min_samples_leaf=3, criterion='entropy', max_features=None,
            n_jobs=1, random_state=0), {'nEstimators': 10, 'maxDepth': 10, 'nJobs': 1, 'seed': 0})],
        'extraTrees': [('fixed', lambda: extra_factory(n_estimators=10, max_depth=10,
            min_samples_split=2, min_samples_leaf=3, criterion='entropy', max_features=None,
            n_jobs=1, random_state=0), {'nEstimators': 10, 'maxDepth': 10, 'nJobs': 1, 'seed': 0})],
        'adaBoostTree': [('fixed', adaboost, {'nEstimators': 10, 'treeMaxDepth': 10, 'seed': 0})],
        'gradientBoosting': [('fixed', lambda: GradientBoostingClassifier(n_estimators=10, max_depth=10,
            min_samples_split=2, min_samples_leaf=3, learning_rate=0.1, subsample=1.0,
            max_features=None, random_state=0), {'nEstimators': 10, 'maxDepth': 10, 'seed': 0})],
        'svc': [
            ('rbf', lambda: make_pipeline(StandardScaler(), svc_factory(kernel='rbf', C=1.0, gamma=0.1, random_state=0)),
             {'kernel': 'rbf', 'C': 1.0, 'gamma': 0.1, 'scalerFitOnTrainOnly': True}),
            ('linear', lambda: make_pipeline(StandardScaler(), svc_factory(kernel='linear', C=1.0, random_state=0)),
             {'kernel': 'linear', 'C': 1.0, 'scalerFitOnTrainOnly': True}),
        ],
    }


def evaluate_fold(fold: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    '''Score labels only. There are no probabilities, signals, predictions, or trade metrics in output.''' 
    train, test = fold['training'], fold['testing']
    y_train, y_test = [row['label'] for row in train], [row['label'] for row in test]
    majority = 1 if sum(y_train) * 2 > len(y_train) else 0
    baseline = metrics(y_test, [majority] * len(y_test))
    names = ('randomForest', 'extraTrees', 'adaBoostTree', 'gradientBoosting', 'svc')
    try:
        candidates = model_factories()
    except ImportError:
        return baseline, {name: {'status': 'skipped', 'reason': 'scikit-learn is not installed.'} for name in names}
    if len(set(y_train)) < 2:
        return baseline, {name: {'status': 'skipped', 'reason': 'outer training labels contain one class.'} for name in names}
    x_train, x_test = [row['features'] for row in train], [row['features'] for row in test]
    output: dict[str, Any] = {}
    for name, variants in candidates.items():
        metrics_by_variant: dict[str, Any] = {}
        for variant, factory, fixed_spec in variants:
            try:
                classifier = factory()
                classifier.fit(x_train, y_train)
                prediction = [int(value) for value in classifier.predict(x_test)]
                metrics_by_variant[variant] = {'status': 'complete', 'fixedSpec': fixed_spec,
                                               'labelMetrics': metrics(y_test, prediction)}
            except (ValueError, ArithmeticError) as error:
                metrics_by_variant[variant] = {'status': 'skipped', 'reason': str(error)[:180], 'fixedSpec': fixed_spec}
        output[name] = next(iter(metrics_by_variant.values())) if len(metrics_by_variant) == 1 else {
            'status': 'complete', 'variants': metrics_by_variant}
    return baseline, output


def gap_summary(snapshots: list[dict[str, Any]]) -> dict[str, float | int]:
    gaps = [snapshots[i]['time'] - snapshots[i - 1]['time'] for i in range(1, len(snapshots))]
    ordered = sorted(gaps)
    midpoint = len(ordered) // 2
    median = ordered[midpoint] if len(ordered) % 2 else (ordered[midpoint - 1] + ordered[midpoint]) / 2
    return {'count': len(gaps), 'minimumSeconds': min(gaps), 'medianSeconds': median, 'maximumSeconds': max(gaps)}


def compact_model_fold(fold: dict[str, Any], result: dict[str, Any] | None, baseline: dict[str, Any]) -> dict[str, Any]:
    evaluated = result is not None and result.get('status') == 'complete'
    label_metrics = result.get('labelMetrics', {}) if result is not None and evaluated else {}
    return {
        'trainStart': fold['training'][0]['time'], 'trainEnd': fold['training'][-1]['time'],
        'testStart': fold['testing'][0]['time'], 'testEnd': fold['testing'][-1]['time'],
        'testWindowExclusiveEnd': fold['end'], 'trainRows': len(fold['training']),
        'testRows': len(fold['testing']), 'purgedRows': fold['purgedRows'],
        'accuracy': label_metrics.get('accuracy'),
        'balancedAccuracy': label_metrics.get('balancedAccuracy'),
        'precision': label_metrics.get('precision'), 'recall': label_metrics.get('recall'),
        'baselineAccuracy': baseline['accuracy'],
        'confusion': label_metrics.get('confusion', [[0, 0], [0, 0]]),
        'metricScope': 'offline binary-label metric, not trade accuracy or a future win probability.',
        **({} if evaluated else {'reason': result.get('reason', 'not evaluated') if result else 'not evaluated'}),
    }


def fixed_configuration(name: str) -> dict[str, Any]:
    '''Declared bounded settings; not a fitted-model artifact or a best-model choice.'''
    if name.startswith('svc-'):
        config: dict[str, Any] = {'kernel': name[4:], 'C': 1.0, 'randomState': 0, 'scalerFitOnTrainOnly': True}
        if name == 'svc-rbf':
            config['gamma'] = 0.1
        return config
    config = {'nEstimators': 10, 'maxDepth': 10, 'minSamplesSplit': 2, 'minSamplesLeaf': 3, 'maxFeatures': None, 'seed': 0}
    if name in ('randomForest', 'extraTrees'):
        config.update({'criterion': 'entropy', 'nJobs': 1})
    elif name == 'adaBoostTree':
        config.update({'baseEstimator': 'DecisionTreeClassifier', 'treeCriterion': 'entropy', 'treeMaxDepth': 10})
    else:
        config.update({'learningRate': 0.1, 'subsample': 1.0})
    return config


def render_models(fold_results: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]]) -> list[dict[str, Any]]:
    '''Flatten five source families into six fixed configurations because SVC has two source kernels.''' 
    selectors = [
        ('randomForest', 'randomForest', None), ('extraTrees', 'extraTrees', None),
        ('adaBoostTree', 'adaBoostTree', None), ('gradientBoosting', 'gradientBoosting', None),
        ('svc-rbf', 'svc', 'rbf'), ('svc-linear', 'svc', 'linear'),
    ]
    rendered: list[dict[str, Any]] = []
    for output_name, family, variant in selectors:
        model_folds: list[dict[str, Any]] = []
        skipped_reasons: list[str] = []
        for fold, baseline, family_results in fold_results:
            result = family_results.get(family)
            if result is not None and variant is not None:
                result = result.get('variants', {}).get(variant, {'status': 'skipped', 'reason': 'SVC variant unavailable.'})
            if result is not None and result.get('status') != 'complete':
                skipped_reasons.append(result.get('reason', 'not evaluated'))
            model_folds.append(compact_model_fold(fold, result, baseline))
        complete = any(model_fold['accuracy'] is not None for model_fold in model_folds)
        item: dict[str, Any] = {'name': output_name, 'configuration': fixed_configuration(output_name), 'status': 'complete' if complete else 'skipped', 'folds': model_folds,
                                'metricScope': 'All scores evaluate the offline future-dependent label only.'}
        if not complete:
            item['reason'] = skipped_reasons[0] if skipped_reasons else 'No valid chronological, purged outer fold was available.'
        rendered.append(item)
    return rendered


def run(payload: Any) -> dict[str, Any]:
    '''Run CPU-bounded offline research and return metadata/metrics only, never a fitted model.''' 
    import time
    snapshots, metadata = validate_payload(payload)
    features = build_feature_rows(snapshots)
    labelled = attach_future_labels(features, snapshots, metadata['spec']['horizonSeconds'])
    folds = build_outer_folds(labelled, metadata['spec'])
    fold_results = [(fold, *evaluate_fold(fold)) for fold in folds]
    models = render_models(fold_results)
    positive = sum(row['label'] for row in labelled)
    return {
        'kind': 'orderbook-ml', 'status': 'ok', 'engine': 'Independent offline event-time order-book research',
        'engineVersion': VERSION, 'instrument': metadata['instrument'], 'source': metadata['source'],
        'generatedAt': int(time.time() * 1000), 'snapshots': len(snapshots), 'featureRows': len(features),
        'features': 64, 'horizonSeconds': metadata['spec']['horizonSeconds'], 'models': models,
        'probability': None,
        'validation': {
            'status': 'validated', 'inputByteLimit': MAX_INPUT_BYTES,
            'requirements': '500-12000 rows; strict time; 3 levels; ordered, non-crossed books; finite positive prices; nonnegative quantities; positive depth; defined weighted denominators.',
            'ohlcAccepted': False,
        },
        'userSourceMetadata': {
            'rightsConfirmed': True,
            'rightsVerification': 'Caller assertion only; this offline worker does not independently verify rights.',
        },
        'sourceInventory': {
            'inventoryId': 'sgx-orderbook-tick-data-trading-strategy-master-2026-10-15',
            'inventoryEntryCount': 20, 'sourceCandidateFamilies': 5,
            'sourceCodeLicense': 'absent/unlicensed; no repository code copied',
            'sourceDataRights': 'unknown/unlicensed; no repository data downloaded or used',
            'sourceDeployableLiveOrPaperStrategies': 0,
        },
        'featureSchema': {
            'count': 64, 'names': feature_names(),
            'prefixCausality': 'At each actual event, every lag uses the latest actual snapshot at or before time-lag. There is no future feature data, global mean fill, forward fill, or synthetic one-second snapshot.',
        },
        'sampling': {
            'mode': 'event-time adaptation', 'fabricatedOneSecondRows': 0, 'gapDisclosure': gap_summary(snapshots),
            'note': 'Irregular actual-event gaps are preserved rather than filled. Full lookback is required before a feature row is emitted.',
        },
        'dataset': {
            'labelledRows': len(labelled), 'positiveLabels': positive, 'negativeLabels': len(labelled) - positive,
            'excludedForLookback': len(snapshots) - len(features),
            'excludedForFutureTailOrCoverage': len(features) - len(labelled),
            'labelDefinition': '1 iff current best bid exceeds the minimum actual future best ask in (time, time+horizonSeconds]; incomplete tails receive no label and no final-ask fallback.',
        },
        'evaluation': {
            'outerFoldCount': len(folds),
            'purgeRule': 'Within each 1800-second prior window, every row with labelEnd >= firstTestTime is excluded from training.',
            'trainingBound': 'At most 2500 chronologically spaced training rows per fold; deterministic seed 0 for stochastic estimators; n_jobs=1.',
            'selection': 'No optimal model chosen. There is no inner purged chronological selection split; all fixed candidate comparisons are reported and outer tests never choose a model.',
            'candidateAccounting': 'Five source candidate families are reported as six fixed configurations because the SVC family has RBF and linear alternatives.',
        },
        'limitations': [
            'Offline research only: no live feed, model persistence, order routing, paper execution, HFT, DMA, RL, or session/journal access.',
            'Labels require future observations and are unavailable at their event time; testSeconds is an outer holdout window, not a claimed 10-second market forecast.',
            'Metrics are binary-label metrics, not profitability, fill quality, trade accuracy, calibrated probability, or future win probability.',
            'No result artifact, pickle, model file, external network request, environment-variable read, cookie, credential, or feature-value export is performed.',
        ],
    }


def main() -> None:
    if '--json' not in sys.argv:
        fail('usage', 'Use --json and provide one book payload on stdin.')
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        fail('input_too_large', 'Research input exceeds 8 MiB.')
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail('invalid_json', 'stdin must contain one valid UTF-8 JSON object.')
    print(json.dumps(run(payload), allow_nan=False, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except ContractError as error:
        print(json.dumps({'kind': 'orderbook-ml', 'status': 'error', 'error': {'code': error.code, 'message': str(error)}}, separators=(',', ':')))
        sys.exit(2)
    except Exception:
        print(json.dumps({'kind': 'orderbook-ml', 'status': 'error', 'error': {'code': 'internal_error', 'message': 'Offline worker failed without exposing input data.'}}, separators=(',', ':')))
        sys.exit(1)
