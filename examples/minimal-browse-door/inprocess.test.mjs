// SPDX-License-Identifier: Apache-2.0
// Runnable in-process evidence for this browse door (C234, C238, C236, C240, C250).
process.env.SHOKAI_INPROCESS_ONLY = "1";
await import("./check.mjs");
