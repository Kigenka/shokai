<!-- SPDX-License-Identifier: Apache-2.0 -->
# P34: Good-faith security research and safe harbor (draft)

*Proposal, not in force. Draft for legal review; moved out of SECURITY.md (pre-release review, 0.5.0) so readers do not rely on text that is not yet approved. When counsel approves it, it returns to SECURITY.md as policy.*

Shōkai welcomes good-faith security research intended to identify, report and help resolve vulnerabilities.

For research conducted in accordance with this policy against systems expressly identified as in scope and controlled by **Yu Sung Yeh**, we consider those activities authorized. We will not initiate or support civil legal claims or request law-enforcement action solely on the basis of such compliant research.

Researchers must limit testing to what is reasonably necessary to demonstrate a vulnerability, avoid disrupting services or harming users, and refrain from accessing, retaining, modifying or disclosing unnecessary personal or confidential information. Researchers must not conduct denial-of-service attacks, social engineering, lateral movement, persistence, or actual financial transactions as part of testing without separate written authorization. Use test identities and data wherever possible.

Researchers who encounter sensitive information or risks to users should stop the affected testing and report the issue through the private reporting channels in SECURITY.md. We seek coordinated disclosure, ordinarily within 90 days, with adjustments where necessary for urgent risks or remediation complexity.

**In-scope assets:** Only the open-source reference code run locally by the researcher is in scope. No live Kigenka or demo systems are in scope until listed here. This policy applies only to that code, run on the researcher's own machine. It does not authorize security testing against independent Shōkai implementations, third-party businesses, banks, identity providers, or their infrastructure. Publishing Shōkai's open-source code does not grant permission to test systems operated by other people.

This policy does not establish a bug-bounty program or a right to compensation. It cannot bind third parties or government authorities and does not provide immunity for activities outside the stated authorization.

