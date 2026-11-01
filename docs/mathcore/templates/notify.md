# Notification templates

These are the only texts the pipeline may send. Free text is never sent.
Placeholders in `{braces}` are filled only with pipeline values: a prompt id, a status, a percentage the owner entered, or a PR or compare URL on github.com/mae-academy/mae-academy-v3.

Sending requires `notifications_enabled: true` in BUDGET.json and a recipient in `allowed_recipients`. Voice also requires `voice_enabled: true`.
Daily limits: at most 3 SMS and 1 voice call. Over the limit, the event is logged and nothing is sent.

| Template | Channel | Text |
|---|---|---|
| `test` | SMS | MAE Math Core pipeline: test message. No action needed. |
| `prompt_passed` | SMS | MAE Math Core: prompt {id} passed the gate. PR ready for review: {url} |
| `prompt_failed` | SMS | MAE Math Core: prompt {id} failed the gate (attempt {attempt} of 2). Report: {url} |
| `prompt_blocked` | SMS | MAE Math Core: prompt {id} is blocked after 2 failed attempts. Schedule paused until you unblock it. Report: {url} |
| `budget_deferred` | SMS | MAE Math Core: prompt {id} deferred by the budget guard. Reason: {reason} |
| `pipeline_down` | Voice | MAE Math Core pipeline is down. Three prompts in a row are blocked, or the scheduler cannot run. Please check the reports. |
| `budget_exceeded` | Voice | MAE Math Core: weekly usage is above 90 percent. The pipeline has paused. |

`{reason}` is one of the fixed reason strings produced by `scripts/mathcore/budget-guard.ts`.
