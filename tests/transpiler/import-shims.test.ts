// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { PineTS, Provider } from 'index';
import { Context } from '../../src/Context.class';
import { transpile } from '../../src/transpiler/index';

describe('Transpiler - Import Shims', () => {
    const source = `//@version=5
indicator("import-shims")
import TradingView/ZigZag/7 as zigzag
import TradersReality/Traders_Reality_Lib/1 as trLib

var settings = zigzag.Settings.new(1.0, 2, color(na), false, false, false, false, "Absolute", true)
var zz = zigzag.newInstance(settings)
_pivot = zz.lastPivot()
[pvsraColor, climax, volClimax, volAboveAvg, spreadWide] = trLib.calcPvsra(open, high, low, close, volume, 10, 10, 10, 10, 10, color.green)
flag = trLib.getPvsraFlagByColor(pvsraColor)

plot(flag, "flag")
`;

    it('injects supported library aliases from $.imports during transpilation', () => {
        const context = new Context({
            marketData: [],
            source: [],
            tickerId: 'BTCUSDC',
            timeframe: '240',
        } as any);

        const transpiled = transpile.bind(context)(source);
        const transpiledCode = transpiled.toString();

        expect(transpiledCode).toMatch(/const zigzag = \$\.imports\.zigzag/);
        expect(transpiledCode).toMatch(/trLib = \$\.imports\.trLib/);
    });

    it('executes Pine scripts that rely on supported import shims', async () => {
        const start = new Date('2024-01-01T00:00:00.000Z').getTime();
        const end = new Date('2024-01-03T23:59:59.999Z').getTime();
        const pineTS = new PineTS(Provider.Mock, 'BTCUSDC', '240', null, start, end);

        const context: any = await pineTS.run(source);
        const plotData = context.plots.flag?.data ?? [];

        expect(plotData.length).toBeGreaterThan(0);
        expect(plotData.every((entry: any) => entry.value === 0)).toBe(true);
    });
});
