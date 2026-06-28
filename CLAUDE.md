# GymSync App - Claude Code Workflow

## GitHub Integration & Automatic Commits

This project is configured for seamless GitHub integration with Claude Code.

### Workflow Rules

1. **Automatic Commits**: Claude commits changes after each edit session with a clear summary message
2. **Session Start**: Claude checks GitHub for updates and pulls any remote changes before starting work
3. **Commit Format**: Concise messages describing what changed and why, not HOW (implementation details)

### Setup Instructions

This project uses:
- Local git repository with remote tracking
- GitHub as the primary remote (`origin`)
- Automatic commit messages from Claude summarizing changes
- Pre-session checks to sync with remote

### GitHub Repository URL

Once created, the repo will be: `https://github.com/yoshil061111/gymsync-app`

### For Users

- Make edits locally or request changes through Claude Code
- Claude will commit and push automatically after each work session
- At the start of each session, Claude checks for remote updates and pulls them
- All commits include descriptive messages for easy history tracking

### Git Ignore

The `.gitignore` file is configured to exclude:
- `node_modules/`
- Build artifacts
- Local environment files

---

**Last Updated**: 2026-04-18
