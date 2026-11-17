# State table: call recording and AI disclosure

> **DRAFT. Not legal advice. Not reviewed by a lawyer.** Lane 10. Every row checked November 17, 2026 unless it says otherwise.
> Sources [S1] and so on are in `legal/sources.md`. Statute numbers come from general knowledge and were **not** re-read at the official source in this session; the lawyer should confirm each.

## How Pip uses this table

Pip does not vary its behavior by state. In every state a teammate says it is an AI at the start and announces recording on every recorded call. The database's default row (`jurisdiction_rules`, state `US`) is set to all-party consent, and the stricter of the default and the state row applies. So this table is a check that the single rule is strict enough, and a list of where the law is moving. Nothing in the code reads the recording column yet, because calls are not live.

## 1. Call recording consent

"All-party" means everyone on the call must consent. "One-party" means the business's own consent is enough. A call between two states is safest treated under the stricter one.

| State | Rule | Statute (to confirm) | Database row | Source |
| --- | --- | --- | --- | --- |
| California | All-party | Penal Code 632, 632.7 | all_party ✓ | [S7] |
| Delaware | All-party in practice; statutes conflict | 11 Del. C. 1335, 2402 | all_party ✓ | [S7] |
| Florida | All-party | Fla. Stat. 934.03 | all_party ✓ | [S7] |
| Illinois | All-party | 720 ILCS 5/14-2 | all_party ✓ | [S7] |
| Maryland | All-party | Cts. & Jud. Proc. 10-402 | all_party ✓ | [S7] |
| Massachusetts | All-party | G.L. c. 272, s. 99 | all_party ✓ | [S7] |
| Montana | All-party | MCA 45-8-213 | all_party ✓ | [S7] |
| Nevada | All-party for phone calls | NRS 200.620 | all_party ✓ | [S7] |
| New Hampshire | All-party | RSA 570-A:2 | all_party ✓ | [S7] |
| Pennsylvania | All-party | 18 Pa.C.S. 5704 | all_party ✓ | [S7] |
| Washington | All-party | RCW 9.73.030 | all_party ✓ | [S7] |
| Connecticut | Mixed: civil liability for recording a phone call without all-party consent or notice | C.G.S. 52-570d | mixed ✓ | [S7] |
| Michigan | Mixed: some lists count it as all-party; courts have allowed a participant to record | MCL 750.539c | mixed ✓ | [S7] |
| Oregon | Mixed: one-party for phone calls, all-party in person | ORS 165.540 | mixed ✓ | [S7] |
| Idaho | One-party | Idaho Code 18-6702 | one_party ✓ | [S7] |
| All other states and D.C. | One-party | Federal: 18 U.S.C. 2511(2)(d) | not listed; default all_party applies | [S7] |

**Result:** the database agrees with the sources on every listed state. Every recording row has an empty `sources` field; the pull request lists the sources to add.

**Not settled:** whether an AI vendor that processes a call live is a third party under California Penal Code 631, which would make the announcement necessary on calls that are not recorded [S15]. Memo item 2.

## 2. AI disclosure

Pip's rule (disclose at the start, always) meets or exceeds each of these. The column "Reaches a small business's front-desk assistant?" is this lane's reading of secondary sources and is the part most in need of a lawyer.

| State | Law | Disclosure trigger | In force | Reaches a front-desk assistant? | Database row | Source |
| --- | --- | --- | --- | --- | --- | --- |
| California | Bot disclosure law (Bus. & Prof. Code 17940 and following) | A bot used to deceive someone to sell goods or sway a vote | Yes | Yes when selling | Says "sales bots and companion chatbots" ✓ | [S3] |
| California | SB 243, companion chatbots | When a reasonable person could think it is human | Jan 1, 2026 | Aimed at companion bots | ✓ | [S3] |
| California | AB 1609, customer-service chatbots (ch. 733, 2026) | May not present a chatbot as human; clear disclosure if a person would be misled; right to reach a person | Jan 1, 2027 | Only businesses over $500M revenue | **Missing: add** | [S5] |
| Utah | SB 149 (2024) as amended by SB 226 (2025) | When the customer clearly asks; up front for high-risk regulated services | Yes | Yes | ✓ | [S3] |
| Maine | Chatbot Disclosure Act (LD 1727) | When a customer could think it is a person | Sept 24, 2025 | Yes | ✓ | [S2] |
| New York | AI companion law (Gen. Bus. Law art. 47) | At the start and at intervals | Nov 5, 2025 | Aimed at companion bots. A second law signed Oct 28, 2026 was not reviewed. | "Confirm scope" stands | [S3] |
| New Jersey | Database says bots in online sales must not deceive without disclosure | | Not verified | Unknown | **No source found this session** | none |
| Idaho | Conversational AI Safety Act, S 1297 (2026 Session Laws ch. 249) | When a reasonable person could think it is human; crisis protocol; rules for minors | **July 1, 2027** | Possibly. Memo item 4. | Says "confirm its effective date": **update** | [S1] |
| Colorado | Conversational AI law (HB 26-1263); separately the 2024 AI Act, narrowed and delayed by SB 189 | At first interaction and at intervals (per one secondary source) | Jan 1, 2027 | Unknown | Refers to the 2024 Act only: **update** | [S4][S6] |
| Oregon | 2026 chatbot law | When a person could think it is human | Jan 1, 2027 | Unknown | Says required now: **correct the date** | [S3] |
| Washington | 2026 chatbot law | Notice at start and at intervals | Jan 1, 2027 | Database asks the same question | ✓ | [S3][S4] |
| Connecticut | 2026 chatbot law | Not reviewed | Varies by section; Jan 1, 2027 per one source | Unknown | **Missing: add** | [S3][S4] |
| Georgia | 2026 chatbot law | Notice at start and at intervals | July 1, 2027 | Unknown | **Missing: add** | [S3][S4] |
| Hawaii, Iowa, Nebraska, Rhode Island | 2026 chatbot laws listed by one tracker | Not reviewed | Hawaii July 14, 2026; Iowa July 1, 2027; Rhode Island Jan 1, 2027; Nebraska not stated | Unknown | **Missing: review** | [S4] |
| Federal | No general AI-disclosure statute found. FTC deception rules apply to pretending to be human. AI voices on outbound calls are "artificial voices" needing consent. | | | Yes for outbound calls | Default row ✓ | [S8] |

## 3. Proposed corrections to `jurisdiction_rules`

Not applied. For Brayden and the lawyer to approve; `reviewed_by_lawyer` stays false until the lawyer says otherwise.

| Row | Change |
| --- | --- |
| ID | `ai_disclosure`: "Conversational AI Safety Act (S 1297), effective July 1, 2027: disclose when a person could think it is human; crisis protocol; rules for minors." Replace the source with the Idaho Legislature bill page. |
| CO | `ai_disclosure`: "2024 AI Act narrowed and delayed to Jan 1, 2027 (SB 189). Conversational AI law HB 26-1263, effective Jan 1, 2027. Confirm scope." |
| CA | Add: "AB 1609 customer-service chatbots, effective Jan 1, 2027, businesses over $500M revenue only." |
| OR | Add "effective Jan 1, 2027". |
| CT, GA, HI, IA, NE, RI | Add `ai_disclosure` notes with dates above, marked "confirm scope". |
| NJ | Find a source or clear the note. |
| All rows | Fill `sources`. Only ID and US have any today. |
| FL, OK, MD, TX, WA | Calling-hours rows have no source. Texas confirmed at 9 a.m. to 9 p.m. Monday to Saturday, noon to 9 p.m. Sunday [S17]; the others were not verified this session. |
