// SPDX-License-Identifier: AGPL-3.0-only

import { PineTS } from '../../../PineTS.class';
import { Series } from '../../../Series';

type LowerBar = {
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

function timeframeSeconds(tf: string): number {
    const s = String(tf || '').trim().toUpperCase();
    if (!s) return 0;
    if (/^\d+$/.test(s)) return parseInt(s, 10) * 60;

    const match = s.match(/^(\d+)?([SDWM])$/);
    if (!match) return 0;
    const mult = parseInt(match[1] || '1', 10);
    const unit = match[2];
    if (unit === 'S') return mult;
    if (unit === 'D') return mult * 86400;
    if (unit === 'W') return mult * 7 * 86400;
    if (unit === 'M') return mult * 30 * 86400;
    return 0;
}

function canonicalTimeframe(tf: any): string {
    const s = String(tf || '').trim();
    if (!s) return '';
    const upper = s.toUpperCase();
    if (upper === '1D' || upper === 'D') return 'D';
    if (upper === '1W' || upper === 'W') return 'W';
    if (upper === '1M' || upper === 'M') return 'M';
    return upper;
}

function anchorBucketStart(timestamp: number, rawTf: string): number {
    const tf = canonicalTimeframe(rawTf);
    const msSec = 1000;
    const msMin = 60 * msSec;
    const msDay = 24 * 60 * msMin;

    if (/^\d+$/.test(tf)) {
        const bucketMs = parseInt(tf, 10) * msMin;
        return Math.floor(timestamp / bucketMs) * bucketMs;
    }

    const match = tf.match(/^(\d+)?([SDWM])$/);
    if (!match) {
        return Math.floor(timestamp / msDay) * msDay;
    }

    const mult = parseInt(match[1] || '1', 10);
    const unit = match[2];

    if (unit === 'S') {
        const bucketMs = mult * msSec;
        return Math.floor(timestamp / bucketMs) * bucketMs;
    }

    if (unit === 'D') {
        const bucketMs = mult * msDay;
        return Math.floor(timestamp / bucketMs) * bucketMs;
    }

    if (unit === 'W') {
        const weekStartMs = Date.UTC(1970, 0, 5); // Monday 1970-01-05
        const base = timestamp - weekStartMs;
        const bucketMs = mult * 7 * msDay;
        return weekStartMs + Math.floor(base / bucketMs) * bucketMs;
    }

    if (unit === 'M') {
        const d = new Date(timestamp);
        const monthIndex = d.getUTCFullYear() * 12 + d.getUTCMonth();
        const bucketMonthIndex = Math.floor(monthIndex / mult) * mult;
        const year = Math.floor(bucketMonthIndex / 12);
        const month = bucketMonthIndex % 12;
        return Date.UTC(year, month, 1);
    }

    return Math.floor(timestamp / msDay) * msDay;
}

function classifyVolumeDelta(bar: LowerBar, prevClose: number | null): number {
    if (bar.close > bar.open) return bar.volume;
    if (bar.close < bar.open) return -bar.volume;
    if (prevClose !== null) {
        if (bar.close > prevClose) return bar.volume;
        if (bar.close < prevClose) return -bar.volume;
    }
    return 0;
}

async function loadLowerBars(context: any, requestedTf: string): Promise<{ timeframe: string; bars: LowerBar[] }> {
    const chartTf = context.timeframe;
    const chartSecs = context.pine.timeframe.in_seconds(chartTf);
    const candidates = [
        canonicalTimeframe(requestedTf),
        '1',
        '5',
        '15',
        '60',
        '240',
    ].filter((tf, idx, arr) => tf && arr.indexOf(tf) === idx && timeframeSeconds(tf) > 0 && timeframeSeconds(tf) < chartSecs);

    const effectiveSDate = context.sDate || (context.marketData?.length > 0 ? context.marketData[0].openTime : undefined);
    const secEDate = context.marketData?.length > 0
        ? context.marketData[context.marketData.length - 1].closeTime
        : context.eDate || Date.now();

    for (const tf of candidates) {
        const pineTS = new PineTS(context.source, context.tickerId, tf, null, effectiveSDate, secEDate);
        pineTS.markAsSecondary();
        await pineTS.ready();
        const bars = ((pineTS as any).data || []) as LowerBar[];
        if (bars.length > 0) {
            return { timeframe: tf, bars };
        }
    }

    return { timeframe: canonicalTimeframe(requestedTf), bars: [] };
}

export function requestVolumeDelta(context: any) {
    return async (_lowerTimeframe: any, _anchorTimeframe: any, _callId?: string) => {
        const lowerTimeframe = Series.from(_lowerTimeframe).get(0);
        const anchorTimeframe = Series.from(_anchorTimeframe).get(0);

        const cacheKey = `ta.requestVolumeDelta.data:${context.tickerId}:${String(lowerTimeframe)}:${context.timeframe}`;
        if (!context.cache[cacheKey] || context.cache[cacheKey].dataVersion !== context.dataVersion) {
            context.cache[cacheKey] = {
                ...(await loadLowerBars(context, String(lowerTimeframe))),
                dataVersion: context.dataVersion,
            };
        }

        if (!context.taState) context.taState = {};
        const stateKey = _callId || `requestVolumeDelta:${String(lowerTimeframe)}:${String(anchorTimeframe)}`;
        if (!context.taState[stateKey]) {
            context.taState[stateKey] = {
                lastIdx: -1,
                prevAnchorBucket: null,
                prevCloseValue: 0,
                prevLastLowerClose: null,
                currentAnchorBucket: null,
                currentCloseValue: 0,
                currentLastLowerClose: null,
            };
        }

        const state = context.taState[stateKey];
        if (context.idx > state.lastIdx) {
            if (state.lastIdx >= 0) {
                state.prevAnchorBucket = state.currentAnchorBucket;
                state.prevCloseValue = state.currentCloseValue;
                state.prevLastLowerClose = state.currentLastLowerClose;
            }
            state.lastIdx = context.idx;
        }

        const currentOpenTime = Series.from(context.data.openTime).get(0);
        const currentCloseTime = Series.from(context.data.closeTime).get(0);
        const currentAnchorBucket = anchorBucketStart(currentOpenTime, String(anchorTimeframe));

        let running = state.prevAnchorBucket === currentAnchorBucket ? state.prevCloseValue : 0;
        let highValue = running;
        let lowValue = running;
        let closeValue = running;
        let lastLowerClose = state.prevLastLowerClose as number | null;

        const lowerBars = context.cache[cacheKey].bars as LowerBar[];
        for (const bar of lowerBars) {
            if (bar.closeTime <= currentOpenTime) {
                lastLowerClose = bar.close;
                continue;
            }
            if (bar.openTime >= currentCloseTime) {
                break;
            }
            if (bar.openTime < currentOpenTime || bar.openTime >= currentCloseTime) {
                continue;
            }

            const delta = classifyVolumeDelta(bar, lastLowerClose);
            running += delta;
            closeValue = running;
            if (running > highValue) highValue = running;
            if (running < lowValue) lowValue = running;
            lastLowerClose = bar.close;
        }

        state.currentAnchorBucket = currentAnchorBucket;
        state.currentCloseValue = closeValue;
        state.currentLastLowerClose = lastLowerClose;

        return [[
            context.precision(state.prevAnchorBucket === currentAnchorBucket ? state.prevCloseValue : 0),
            context.precision(highValue),
            context.precision(lowValue),
            context.precision(closeValue),
        ]];
    };
}
