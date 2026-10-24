---
name: curinos-output
description: >
  SECOND STEP of the Curinos dashboard pipeline. Trigger phrases: "generate dashboard",
  "build the dashboard", "create the dashboard", "make the HTML". Run ONLY after
  curinos-intel has produced an intel JSON file. Your entire job is two bash commands.
  Do NOT write any Python. Do NOT write any HTML. Do NOT modify any scripts.
  Just run the two commands below.
---

# Curinos Dashboard Output

**Run these two commands. That is your entire job. Do not write code. Do not modify anything.**

## Command 1 — Build

```bash
python3 /mnt/project/build_v2.py
```

If this prints an error saying no intel JSON found, tell the user:
`"No intel file found. Please type 'run intel on [bank name]' first."`

If it prints `Written: /mnt/user-data/outputs/[name]-curinos-dashboard.html` — proceed to Command 2.

## Command 2 — Validate

```bash
python3 /mnt/project/validate_updated_v2.py
```

If validation prints errors — fix the intel JSON and re-run Command 1.
If validation prints `ALL CHECKS PASSED` — deliver the file.

## Deliver

Call `present_files` with the path printed by Command 1, then show:
```
Dashboard: [slug]-curinos-dashboard.html
[Institution] — [Type] — [Size Band]  
Opportunity: [HIGH/MEDIUM/LOW]
Key trigger: [one sentence from the intel data]
```

---
**Do not edit build_v2.py. Do not rewrite clean(). Do not change the tab count.
The script is correct as-is. Just run it.**
