# ContextKit

A CLI for managing collections of AI skills across Cursor, Claude, and Windsurf. Group skills into named collections, then activate one at a time — ContextKit symlinks the collection's skills into every IDE it detects.

## Commands

```bash
contextkit create <name> --skills skill-a,skill-b   # define a collection
contextkit use <name>                                # activate a collection
contextkit disable                                   # deactivate the active collection
contextkit list                                       # list all collections
contextkit status                                     # show the active collection
contextkit search [query]                             # search skills.sh
contextkit install <skillId>                          # install a skill via npx skills add
contextkit sync [--config <path>]                     # sync collections from .contextkit.yml
```

State lives in `.contextkit/state.json`; skill sources live in `.contextkit/skills/`. Both are project-local.

## Troubleshooting

**`Collection '<name>' already exists`**
Choose a different name, or run `contextkit list` to see existing collections.

**`Collection '<name>' not found`**
Run `contextkit list` to see available collections.

**`File already exists at '<path>'`**
Activating a collection tries to symlink into an IDE directory, but something is already there. Remove the conflicting file manually and re-run `contextkit use <name>`. Activation fails atomically — no partial symlinks are left behind, and the previously active collection (if any) stays active.

**`Permission denied creating symlink at '<path>'`**
ContextKit doesn't have write access to that IDE directory. Check the directory's permissions (or ownership) and try again.

**Warning: `Skill '<id>' not found in '.contextkit/skills/<id>'`**
The collection references a skill that hasn't been installed yet. Run `contextkit install <id>`, or remove it from the collection. This is a warning, not an error — the rest of the collection still activates.

**Config errors from `contextkit sync`**
`.contextkit.yml` must have a top-level `collections` object mapping collection names to arrays of skill IDs:

```yaml
version: "1.0"
collections:
  frontend:
    - owner/skill-name
```
