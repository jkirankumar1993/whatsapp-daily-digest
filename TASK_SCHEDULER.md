# Windows Task Scheduler

## Recommended setup

1. Open **Task Scheduler** and choose **Create Task**.
2. General: name it `WhatsApp Daily Digest`; select **Run only when user is logged on**.
   This is safest when Playwright is configured with `headless: false`.
3. Triggers: add **Daily** at your chosen time.
4. Actions: choose **Start a program**.
5. Program/script: `C:\Windows\System32\cmd.exe`
6. Add arguments:

```text
/d /c "npm run job >> logs\task-scheduler.log 2>&1"
```

7. Start in:

```text
D:\Websites\WhatsAppSummary
```

8. Conditions: if using a laptop, optionally clear **Start the task only if the
   computer is on AC power**.
9. Settings: enable **Run task as soon as possible after a scheduled start is missed**
   and choose **Do not start a new instance** if already running.

Use the absolute path returned by `Get-Command npm.cmd` as Program/script instead if
Task Scheduler cannot find npm. In that case use `run job` as arguments and note that
redirection to the extra scheduler log requires the `cmd.exe` form above. The app
always writes its own timestamped logs to `logs/`.

Test with **Run** in Task Scheduler while `dryRun` is enabled, then inspect the latest
file in `logs/`.
