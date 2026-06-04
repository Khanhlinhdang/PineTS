// SPDX-License-Identifier: AGPL-3.0-only
// This file is auto-generated. Do not edit manually.
// Run: npm run generate:request-index

import { dividends } from './methods/dividends';
import { earnings } from './methods/earnings';
import { param } from './methods/param';
import { security } from './methods/security';
import { security_lower_tf } from './methods/security_lower_tf';
import { splits } from './methods/splits';

const methods = {
  dividends,
  earnings,
  param,
  security,
  security_lower_tf,
  splits
};

export class PineRequest {
  private _cache = {};
  dividends: ReturnType<typeof methods.dividends>;
  earnings: ReturnType<typeof methods.earnings>;
  param: ReturnType<typeof methods.param>;
  security: ReturnType<typeof methods.security>;
  security_lower_tf: ReturnType<typeof methods.security_lower_tf>;
  splits: ReturnType<typeof methods.splits>;

  constructor(private context: any) {
    // Install methods
    Object.entries(methods).forEach(([name, factory]) => {
      this[name] = factory(context);
    });
  }
}

export default PineRequest;
