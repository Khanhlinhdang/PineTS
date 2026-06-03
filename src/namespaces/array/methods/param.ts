// SPDX-License-Identifier: AGPL-3.0-only

import { Series } from '../../../Series';

export function param(context: any) {
    return (source: any, index: number = 0) => {
        if (Array.isArray(source)) return source;
        if (source && typeof source === 'object' && Array.isArray(source.array)) return source;
        return Series.from(source).get(index);
    };
}
