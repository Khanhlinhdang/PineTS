import { describe, expect, it } from 'vitest';

import { PineTS, Provider } from 'index';

describe('Technical Analysis - Oscillators & Momentum', () => {
    it('MOM - Momentum', async () => {
        const pineTS = new PineTS(Provider.Mock, 'BTCUSDC', 'W', null, new Date('2018-12-10').getTime(), new Date('2020-01-27').getTime());

        const sourceCode = (context) => {
            // This is a PineTS port of "Squeeze Momentum Indicator" indicator by LazyBear
            // List of all his indicators: https://www.tradingview.com/v/4IneGo8h/
            const { close, high, low } = context.data;

            const ta = context.ta;
            const math = context.math;

            const input = context.input;
            const { plot, plotchar, nz, color } = context.core;

            const length = input.int(20, 'BB Length');
            const mult = input.float(2.0, 'BB MultFactor');
            const lengthKC = input.int(20, 'KC Length');
            const multKC = input.float(1.5, 'KC MultFactor');

            const useTrueRange = input.bool(true, 'Use TrueRange (KC)');

            // Calculate BB
            let source = close;
            const basis = ta.sma(source, length);
            const dev = multKC * ta.stdev(source, length);
            const upperBB = basis + dev;
            const lowerBB = basis - dev;

            // Calculate KC
            const ma = ta.sma(source, lengthKC);
            const range_1 = useTrueRange ? ta.tr : high - low;
            const rangema = ta.sma(range_1, lengthKC);
            const upperKC = ma + rangema * multKC;
            const lowerKC = ma - rangema * multKC;

            const sqzOn = lowerBB > lowerKC && upperBB < upperKC;
            const sqzOff = lowerBB < lowerKC && upperBB > upperKC;
            const noSqz = sqzOn == false && sqzOff == false;

            const val = ta.linreg(
                source - math.avg(math.avg(ta.highest(high, lengthKC), ta.lowest(low, lengthKC)), ta.sma(close, lengthKC)),
                lengthKC,
                0
            );

            const iff_1 = val > nz(val[1]) ? color.lime : color.green;
            const iff_2 = val < nz(val[1]) ? color.red : color.maroon;
            const bcolor = val > 0 ? iff_1 : iff_2;
            const scolor = noSqz ? color.blue : sqzOn ? color.black : color.gray;
            //plot(val, 'Momentum', { color: bcolor, style: 'histogram', linewidth: 4 });
            //plot(0, 'Cross', { color: scolor, style: 'cross', linewidth: 2 });

            plotchar(val, '_plot');
            plotchar(sqzOn, '_sqzOn');
            plotchar(sqzOff, '_sqzOff');
            plotchar(noSqz, '_noSqz');
        };

        const { result, plots } = await pineTS.run(sourceCode);

        let _plotdata = plots['_plot']?.data;
        let _sqzOndata = plots['_sqzOn']?.data;
        let _sqzOffdata = plots['_sqzOff']?.data;
        let _noSqzdata = plots['_noSqz']?.data;
        const startDate = new Date('2019-08-19').getTime();
        const endDate = new Date('2019-11-18').getTime();

        let plotdata_str = '';
        for (let i = 0; i < _plotdata.length; i++) {
            const time = _plotdata[i].time;
            if (time < startDate || time > endDate) {
                continue;
            }

            const str_time = new Date(time).toISOString().slice(0, -1) + '-00:00';
            const val = parseFloat(_plotdata[i].value).toFixed(3);
            const sqzOn = _sqzOndata[i].value;
            const sqzOff = _sqzOffdata[i].value;
            const noSqz = _noSqzdata[i].value;
            plotdata_str += `[${str_time}]: ${val} ${sqzOn} ${sqzOff} ${noSqz}\n`;
        }

        const expected_plot = `[2019-08-19T00:00:00.000-00:00]: NaN false true false
[2019-08-26T00:00:00.000-00:00]: NaN false true false
[2019-09-02T00:00:00.000-00:00]: 1827.409 false true false
[2019-09-09T00:00:00.000-00:00]: 1410.637 true false false
[2019-09-16T00:00:00.000-00:00]: 939.861 true false false
[2019-09-23T00:00:00.000-00:00]: 125.195 true false false
[2019-09-30T00:00:00.000-00:00]: -600.076 true false false
[2019-10-07T00:00:00.000-00:00]: -1136.367 true false false
[2019-10-14T00:00:00.000-00:00]: -1623.404 true false false
[2019-10-21T00:00:00.000-00:00]: -1912.859 true false false
[2019-10-28T00:00:00.000-00:00]: -2118.731 true false false
[2019-11-04T00:00:00.000-00:00]: -2169.160 true false false
[2019-11-11T00:00:00.000-00:00]: -2296.969 true false false
[2019-11-18T00:00:00.000-00:00]: -2556.464 true false false`;

        console.log('expected_plot', expected_plot);
        console.log('plotdata_str', plotdata_str);
        expect(plotdata_str.trim()).toEqual(expected_plot.trim());
    });
});
