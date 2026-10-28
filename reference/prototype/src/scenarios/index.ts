import type { ScenarioResult } from "./common.js";
import * as l0 from "./l0-unprepared.js";
import * as peer from "./peer-collaboration.js";
import * as store from "./store-and-fashion.js";
import * as bank from "./bank-considering.js";
import * as mis from "./misconduct.js";
import * as teach from "./teaching.js";
import * as gath from "./gathering.js";
import * as ritual from "./ritual-checks.js";
import * as v021 from "./v021-checks.js";
import * as v022 from "./v022-checks.js";
import * as v023 from "./v023-checks.js";
import * as v024 from "./v024-checks.js";
import * as v025 from "./v025-checks.js";
import * as v027 from "./v027-checks.js";

/** In presentation order. Each run() builds its own fresh, deterministic world. */
export const SCENARIOS: { file: string; run: () => ScenarioResult }[] = [
  { file: "01-l0-unprepared-visitor", run: l0.run },
  { file: "02-peer-collaboration", run: peer.run },
  { file: "03-store-and-fashion-house", run: store.run },
  { file: "04-bank-considering", run: bank.run },
  { file: "05-misconduct-and-revocation", run: mis.run },
  { file: "06-teaching-visit", run: teach.run },
  { file: "07-gathering-at-the-engawa", run: gath.run },
  { file: "08-ritual-and-tamper-checks", run: ritual.run },
  { file: "09-v0.2.1-round1-checks", run: v021.run },
  { file: "10-v0.2.2-allowance-and-consent", run: v022.run },
  { file: "11-v0.2.3-round2-negatives", run: v023.run },
  { file: "12-v0.2.4-round3-checks", run: v024.run },
  { file: "13-v0.2.5-round4-checks", run: v025.run },
  { file: "14-v0.2.7-msg-id-checks", run: v027.run },
];
