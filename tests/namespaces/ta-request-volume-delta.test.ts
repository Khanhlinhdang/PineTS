// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { PineTS, Provider } from 'index';

type Bar = {
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

function dayBucketStart(timestamp: number): number {
    const msDay = 24 * 60 * 60 * 1000;
    return Math.floor(timestamp / msDay) * msDay;
}

function classifyVolumeDelta(bar: Bar, prevClose: number | null): number {
    if (bar.close > bar.open) return bar.volume;
    if (bar.close < bar.open) return -bar.volume;
    if (prevClose !== null) {
        if (bar.close > prevClose) return bar.volume;
        if (bar.close < prevClose) return -bar.volume;
    }
    return 0;
}

function round10(value: number): number {
    return Math.round(value * 1e10) / 1e10;
}

function computeExpectedVolumeDelta(chartBars: Bar[], lowerBars: Bar[]) {
    const expected = {
        openDelta: [] as number[],
        highDelta: [] as number[],
        lowDelta: [] as number[],
        closeDelta: [] as number[],
    };

    let prevAnchorBucket: number | null = null;
    let prevCloseValue = 0;
    let prevLastLowerClose: number | null = null;

    for (const chartBar of chartBars) {
        const currentAnchorBucket = dayBucketStart(chartBar.openTime);
        const base = prevAnchorBucket === currentAnchorBucket ? prevCloseValue : 0;
        let running = base;
        let highValue = base;
        let lowValue = base;
        let closeValue = base;
        let lastLowerClose = prevLastLowerClose;

        for (const lowerBar of lowerBars) {
            if (lowerBar.closeTime <= chartBar.openTime) {
                lastLowerClose = lowerBar.close;
                continue;
            }
            if (lowerBar.openTime >= chartBar.closeTime) {
                break;
            }

            const delta = classifyVolumeDelta(lowerBar, lastLowerClose);
            running += delta;
            closeValue = running;
            highValue = Math.max(highValue, running);
            lowValue = Math.min(lowValue, running);
            lastLowerClose = lowerBar.close;
        }

        expected.openDelta.push(round10(base));
        expected.highDelta.push(round10(highValue));
        expected.lowDelta.push(round10(lowValue));
        expected.closeDelta.push(round10(closeValue));

        prevAnchorBucket = currentAnchorBucket;
        prevCloseValue = closeValue;
        prevLastLowerClose = lastLowerClose;
    }

    return expected;
}

describe('ta.requestVolumeDelta', () => {
    const start = new Date('2024-01-01T00:00:00.000Z').getTime();
    const end = new Date('2024-01-07T23:59:59.999Z').getTime();

    it('matches manual cumulative-delta aggregation for 4h bars using 1h lower bars', async () => {
        const pineTS = new PineTS(Provider.Mock, 'BTCUSDC', '240', null, start, end);
        const context: any = await pineTS.run(async (context) => {
            const { ta } = context.pine;
            const [openDelta, highDelta, lowDelta, closeDelta] = await ta.requestVolumeDelta('60', 'D');
            return { openDelta, highDelta, lowDelta, closeDelta };
        });

        const chartBars = await (Provider.Mock as any).getMarketData('BTCUSDC', '240', null, start, end);
        const lowerBars = await (Provider.Mock as any).getMarketData('BTCUSDC', '60', null, start, end);
        const expected = computeExpectedVolumeDelta(chartBars, lowerBars);

        expect(context.result.openDelta).toEqual(expected.openDelta);
        expect(context.result.highDelta).toEqual(expected.highDelta);
        expect(context.result.lowDelta).toEqual(expected.lowDelta);
        expect(context.result.closeDelta).toEqual(expected.closeDelta);

        const cacheKey = 'ta.requestVolumeDelta.data:BTCUSDC:60:240';
        expect(context.cache[cacheKey]).toBeDefined();
        expect(context.cache[cacheKey].timeframe).toBe('60');
        expect(context.cache[cacheKey].bars.length).toBeGreaterThan(0);
    });

    it('falls back to the nearest available lower timeframe when requested data is unavailable', async () => {
        const pineTS = new PineTS(Provider.Mock, 'BTCUSDC', '240', null, start, end);
        const context: any = await pineTS.run(async (context) => {
            const { ta } = context.pine;
            const [openDelta, highDelta, lowDelta, closeDelta] = await ta.requestVolumeDelta('1', 'D');
            return { openDelta, highDelta, lowDelta, closeDelta };
        });

        const cacheKey = 'ta.requestVolumeDelta.data:BTCUSDC:1:240';
        expect(context.cache[cacheKey]).toBeDefined();
        expect(context.cache[cacheKey].timeframe).toBe('60');
        expect(context.cache[cacheKey].bars.length).toBeGreaterThan(0);

        const nonZeroCloses = context.result.closeDelta.filter((value: number) => value !== 0);
        expect(nonZeroCloses.length).toBeGreaterThan(0);
    });
});
