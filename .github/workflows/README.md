# GitHub Actions workflows

| Workflow | Trigger | What it does | Secrets |
| --- | --- | --- | --- |
| `changelog-to-slack.yml` | PR merged into `main` | Posts a one-line changelog message to the Slack **#changes** channel | `SLACK_CHANGES_WEBHOOK_URL` |

Notes:

- This directory is **not** a CI gate — nothing here runs tsc / lint / build / tests.
  A real CI gate (type-check + lint + build + branch protection) is tracked as **PER-69**.
- `pull_request` workflows run from the version of the file on the **base branch** (`main`),
  so changes to a workflow only take effect once merged.
- See [`docs/architecture/operations.md`](../../docs/architecture/operations.md) for how this
  fits the Slack → Linear → GitHub → Vercel work pipeline.
