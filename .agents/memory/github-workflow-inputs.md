---
name: GitHub workflow inputs
description: Timing constraint for showing repository state alongside workflow_dispatch inputs
---

GitHub `workflow_dispatch` input fields are collected in the GitHub UI before the workflow starts. A workflow step cannot display repository data before those fields are filled.

**Why:** The current `version.json` can be read only after checkout, so it cannot dynamically populate or appear beside the manual-run form.

**How to apply:** Add a first job step that prints the current values immediately after checkout, then generate the new file from the submitted inputs. Do not use static defaults as a substitute because they become stale.