// SPDX-License-Identifier: AGPL-3.0-only

export function pivot_point_levels(_context: any) {
    return (type: unknown, _change?: unknown) => {
        const normalizedType = String(type ?? '').trim();
        const levelCount = normalizedType === 'Fibonacci'
            ? 7
            : normalizedType === 'DM'
                ? 3
                : normalizedType === 'Woodie' || normalizedType === 'Classic'
                    ? 9
                    : 11;

        return Array.from({ length: levelCount }, () => Number.NaN);
    };
}
