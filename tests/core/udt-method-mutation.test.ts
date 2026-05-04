import { describe, it, expect } from 'vitest';
import { PineTS, Provider } from 'index';
import { transpile } from '../../src/transpiler/index';

/**
 * Regression suite for the three method-related bugs fixed together:
 *
 *  1. `this`-mutation persistence — Pine `method foo(BAR this, ...) => this.x := y`
 *     used to lose the assignment because `this` was stripped from the JS
 *     param list and the call site passed the receiver positionally with
 *     `$.call(fn, id, obj, ...args)` (which doesn't bind `this`). Body writes
 *     to `this.x` leaked onto `globalThis`. Fix: rename `this` to `self`
 *     in both the param list and the body.
 *
 *  2. Function / method name collision — when a Pine script declared both a
 *     regular function `foo()` and a `method foo()`, both compiled to a JS
 *     function with the same identifier `foo`. The second declaration
 *     shadowed the first, so direct calls `foo(args)` resolved to the
 *     method instead of the regular function. Fix: methods get a `$M_`
 *     prefix on their JS identifier.
 *
 *  3. Param namespace-rename clobbering — when a Pine method/fn param
 *     shadows a Pine namespace (e.g. `color`), the param is renamed to
 *     `color_$N`. The naive walker rewrote EVERY `Identifier('color')` in
 *     the body, including namespace usages like `color.new(arg, 73)` →
 *     `color_$N.new(color_$N, 73)` (broken). Fix: a context-aware walker
 *     that skips MemberExpression objects (namespace member access),
 *     CallExpression callees (namespace function calls), and Property keys.
 */

describe('UDT method this-mutation, naming, and param-shadowing', () => {
    const makePineTS = () =>
        new PineTS(Provider.Mock, 'BTCUSDC', 'D', null,
            new Date('2019-04-01').getTime(),
            new Date('2019-04-15').getTime());

    // ── Codegen shape ──────────────────────────────────────────────────

    it('method receiver `this` is renamed to `self` in both param list and body', () => {
        // Bug 1: previously emitted `function updatePattern(price, index)` with
        // `this.x = ...` in body — `this` was `globalThis` at runtime.
        const code = `
//@version=6
indicator("method this rename", overlay=true)
type BAR
    float lastPrice
method updatePattern(BAR this, float price) =>
    this.lastPrice := price
bar = BAR.new()
bar.updatePattern(close)
plot(close)
        `;
        const result = transpile(code);
        const jsCode = result.toString();

        // Receiver appears as `self` in both param list and body. The body
        // member access is wrapped as `$.get(self, 0).lastPrice` by the
        // expression transformer (series-of-UDT unwrap), but the leaf
        // identifier remains `self`.
        expect(jsCode).toMatch(/function\s+\$M_updatePattern\s*\(\s*self\s*,/);
        expect(jsCode).toMatch(/\$\.get\(\s*self\s*,\s*0\s*\)\.lastPrice/);
        // No bare `this.x` references in method body (would be globalThis writes)
        expect(jsCode).not.toMatch(/\bthis\.lastPrice\b/);
    });

    it('methods get a `$M_` JS prefix to avoid collision with regular functions', () => {
        // Bug 2: previously the second declaration overwrote the first.
        const code = `
//@version=6
indicator("fn vs method", overlay=true)
type FOO
    float x
sameName(int a, int b) =>
    a + b
method sameName(FOO this, int a) =>
    this.x := a
bar = FOO.new()
y = sameName(1, 2)
bar.sameName(5)
plot(close)
        `;
        const result = transpile(code);
        const jsCode = result.toString();

        // BOTH declarations must coexist
        expect(jsCode).toMatch(/function\s+sameName\s*\(\s*a\s*,\s*b\s*\)/);
        expect(jsCode).toMatch(/function\s+\$M_sameName\s*\(\s*self\s*,/);
        // The marker should be on the prefixed identifier
        expect(jsCode).toContain('$M_sameName.__pineMethod__ = true');
    });

    it('param shadowing a Pine namespace preserves namespace usage in the body', () => {
        // Bug 3: param literally named `color` shadows the `color` namespace.
        // The naive walker renamed every `Identifier('color')` in the body —
        // including `color.new(...)` (namespace access), producing the
        // invalid `color_$N.new(color_$N, 73)`. The context-aware walker
        // skips MemberExpression objects (the namespace) but still renames
        // bare identifier reads (the param value passed as an argument).
        const code = `
//@version=6
indicator("param-namespace shadow", overlay=true)
applyTransparency(color) =>
    color.new(color, 73)
c = applyTransparency(#ff0000)
plot(close)
        `;
        const result = transpile(code);
        const jsCode = result.toString();

        // `color.new(` (namespace usage) must survive untouched
        expect(jsCode).toMatch(/\bcolor\.new\(/);
        // The renamed param IS used as the argument value (the expression
        // transformer wraps it in a `color.param(...)` call before passing
        // to `color.new`, so the param name appears inside `color.param(`).
        expect(jsCode).toMatch(/color\.param\(\s*color_\$\d+\b/);
        // The bare param identifier must NOT be wired as a namespace itself —
        // i.e. no `color_$N.new(...)` (that was the broken form)
        expect(jsCode).not.toMatch(/\bcolor_\$\d+\.new\b/);
    });

    // ── Runtime behavior ───────────────────────────────────────────────

    it('method `this.x := y` mutations persist across the receiver instance', async () => {
        // The most direct verification: call a method that mutates a field,
        // then plot the field. If `this` was `globalThis`, the plotted value
        // would be undefined / 0.
        const pineTS = makePineTS();
        const code = `
//@version=6
indicator("this mutation persistence", overlay=true)
type Counter
    int value = 0
method increment(Counter this) =>
    this.value := this.value + 1
var Counter c = Counter.new()
c.increment()
c.increment()
plot(c.value, "count")
plot(close)
        `;
        const { plots } = await pineTS.run(code);
        const counts = plots['count']?.data ?? [];
        expect(counts.length).toBeGreaterThan(0);
        // After two increments per bar, the value should be 2 on the very
        // first bar and accumulate from there. Before the fix this stayed
        // at 0 (or NaN) for all bars.
        const lastValue = counts[counts.length - 1]?.value;
        expect(lastValue).toBeGreaterThanOrEqual(2);
    });

    it('regular fn and method with the same name both work end-to-end', async () => {
        const pineTS = makePineTS();
        const code = `
//@version=6
indicator("dual-name", overlay=true)
type Box
    int n = 0
add(int a, int b) =>
    a + b
method add(Box this, int a) =>
    this.n := this.n + a
var Box b = Box.new()
sum = add(3, 4)
b.add(10)
plot(sum, "sum")
plot(b.n, "boxN")
        `;
        const { plots } = await pineTS.run(code);
        // Regular function must return 7
        const sum = plots['sum']?.data?.[plots['sum'].data.length - 1]?.value;
        expect(sum).toBe(7);
        // Method must accumulate (10 per bar)
        const boxN = plots['boxN']?.data?.[plots['boxN'].data.length - 1]?.value;
        expect(boxN).toBeGreaterThanOrEqual(10);
    });

    it('positional `overlay=true` in indicator(...) is honored, not silently dropped', async () => {
        // Bug: the transpiler wraps positional booleans/numbers in $.param,
        // which promotes them to Series. parseArgsForPineParams then fails
        // the `boolean` / `number` type checks — so `overlay`, `precision`,
        // etc. quietly fell back to defaults.
        const pineTS = makePineTS();
        const code = `
//@version=5
indicator("title", "short", true, max_lines_count = 50)
plot(close)
        `;
        const r = await pineTS.run(code);
        expect(r.indicator?.overlay).toBe(true);
        // Sanity: title and named-arg also survive
        expect(r.indicator?.title).toBe('title');
        expect(r.indicator?.max_lines_count).toBe(50);
    });

    it('method param shadowing the `color` namespace runs without throwing', async () => {
        // Smoke: before the rename fix, this would crash with "fn is not a
        // function" because `color.new(...)` got rewritten to
        // `color_$N.new(...)` and `color_$N` was a string at runtime.
        const pineTS = makePineTS();
        const code = `
//@version=6
indicator("color shadow runtime", overlay=true)
type Marker
    color tone
method setColor(Marker this, color color) =>
    this.tone := color.new(color, 50)
var Marker m = Marker.new()
m.setColor(#ff8800)
plot(close)
        `;
        await expect(pineTS.run(code)).resolves.toBeDefined();
    });
});
