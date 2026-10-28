// The protocol and specification version this implementation speaks (v0.3.0; the rc1 layout is D19).
import type * as S from "./shapes.js";
export const PROTOCOL = "shokai/0.3" as const;
export const SPEC_VERSION = "0.3.0";
/** §3.1 (compatibility, informative): the release candidate of SPEC_VERSION with no wire change from it; a peer naming it speaks this text. */
export const SPEC_RC_SAME_WIRE = "0.3.0-rc4";
export const SPEC_REF: S.SpecRef = { version: SPEC_VERSION, url: `https://shokai.example/spec/v${SPEC_VERSION}` };
/** Appendix B: the conformance test-profile identifier. */
export const TEST_PROFILE = "shokai-b/0.3";
