# Implementation notes: agent-readable evaluation evidence

Historical workstream status: the baseline documentation work was implemented
in `1babff56fd4a7914f46dbd00b94db3a41110dea9`. Its scope, observations and
validation remain tied to the recorded baseline; they are not current
completion test totals. The [Everyday Agents completion plan](2026-09-05-everyday-agents-completion.md)
and [judge guide](../submission/judge-guide.md) govern current product status.
[Implementation evidence](../submission/evidence.md) preserves both snapshots;
[coordination evidence](../submission/coordination-evidence.md) records the
separate measured workflow. The authorization statements below describe this
historical workstream, not a new permission request or production authorization.

## Deviations

- **Research described:** examples from feature revision `248fcb9` and optional
  extra formats. **Found:** `develop` remained at `bf50416`, while another
  workspace continued product development. **Chose:** evidence pinned to
  `bf5041601b8910f92e632034c4c21b644dc6a3a9`, the existing judge guide as the
  canonical entry, and a static public index linking production-branch Markdown.
  **Why:** the local integration change must document the code it actually
  includes and avoid duplicate website copies or promises about unfinished work.
- **Research proposed:** a comparison with fresh readers before interpreting
  discovery improvements. **Found:** a single matched pair identified the
  existing strengths in both snapshots and exposed residual overclaims after
  the first edit. **Chose:** report the qualitative findings and direct-link
  change, then correct the remaining pitch, manual, changelog, and source-comment
  wording. **Why:** one pair does not establish a score or performance effect;
  repeated trials would be needed before making that claim.

## Independent discovery check

Two fresh readers received the same neutral rubric request and isolated
repository snapshots without credentials, dependencies, or test logs. Neither
was told which files or strengths to find. The updated README led its reader
directly to the judge guide, evidence cards, and SDK inventory. Both readers
identified persisted Strands approval and independent database race protection;
the updated snapshot also clearly exposed deterministic notification recovery.

The before reader found model-version, video-status, and provider-privacy
contradictions. The after reader correctly separated current model selection
from historical traces and scripted tests from live observations. It still
flagged a blanket market claim, unproven phone-calendar usage, and absolute
privacy wording in the changelog/source comment; those were corrected in the
final change, along with equivalent wording in the linked user manuals.

An independent structural review counted zero direct README links to the judge
guide, SDK inventory, evidence guide, or docs index before the change, and one
to each afterward. This establishes shorter navigation, not higher judge scores.
