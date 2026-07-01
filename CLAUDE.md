# GymSync App - Claude Code Workflow

## GitHub Integration & Commit Workflow

GitHub is used as a living **development journal** for this project — the commit
history is meant to authentically document the journey of building the app. The
commit trail should read like a real developer's progress log.

### Workflow Rules

1. **Milestone commits**: Commit when a meaningful chunk of work is complete (a
   feature, a fix, a coherent step) — not after every tiny edit, and not as one
   giant dump. Use **one commit per milestone**.
2. **Review before pushing**: Before committing, draft the commit message and
   **show it to the user first**. Wait for their approval (or edits) before
   running `git commit` and `git push`. Never commit or push without explicit OK.
3. **Push frequently**: Once a milestone commit is approved, push it so the
   remote stays an up-to-date record of the journey.
4. **Message style**: Write authentic, human-sounding messages that narrate
   progress — what changed and why, not HOW (implementation details). Avoid
   terse robotic one-liners. Do **not** add a `Co-Authored-By: Claude` trailer
   or any AI-assistance footer — commits are authored solely by the user.
5. **Session start**: Check GitHub for remote updates and pull any changes before
   starting work.

### Setup Instructions

This project uses:
- Local git repository with remote tracking (`origin`)
- GitHub as the primary remote
- User-reviewed, milestone-based commit messages from Claude
- Pre-session checks to sync with remote

### GitHub Repository URL

The repo is: `https://github.com/Yoshilaj/GymSync-app` (default branch: `master`)

### For Users

- Make edits locally or request changes through Claude Code
- Claude proposes a commit message at each milestone; you review and approve
  before it is committed and pushed
- At the start of each session, Claude checks for remote updates and pulls them
- All commits narrate the development journey for an authentic history

### Git Ignore

The `.gitignore` file is configured to exclude:
- `node_modules/`
- Build artifacts
- Local environment files

---

**Last Updated**: 2026-07-01
