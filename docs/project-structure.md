# Project Structure

```
agkan/
├── bin/
│   └── agkan                        # CLI entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── block/               # Blocking relationship commands
│   │   │   │   ├── add.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── remove.ts
│   │   │   ├── meta/                # Metadata commands
│   │   │   │   ├── delete.ts
│   │   │   │   ├── get.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── set.ts
│   │   │   ├── tag/                 # Tag commands
│   │   │   │   ├── add.ts
│   │   │   │   ├── attach.ts
│   │   │   │   ├── delete.ts
│   │   │   │   ├── detach.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── show.ts
│   │   │   ├── board.ts             # Kanban board command
│   │   │   └── task/                # Task commands
│   │   │       ├── add.ts
│   │   │       ├── count.ts
│   │   │       ├── delete.ts
│   │   │       ├── find.ts
│   │   │       ├── get.ts
│   │   │       ├── list.ts
│   │   │       ├── update-parent.ts
│   │   │       └── update.ts
│   │   ├── utils/                   # CLI utilities
│   │   └── index.ts                 # CLI entry point and command registration
│   ├── board/
│   │   └── server.ts                # Kanban board web server (Hono)
│   ├── db/
│   │   ├── config.ts                # DB configuration
│   │   ├── connection.ts            # Database connection management
│   │   ├── schema.ts                # Schema definition and migration
│   │   └── reset.ts                 # DB reset for testing
│   ├── models/
│   │   ├── Task.ts                  # Task model
│   │   ├── Tag.ts                   # Tag model
│   │   ├── TaskBlock.ts             # Blocking relationship model
│   │   ├── TaskMetadata.ts          # Metadata model
│   │   ├── TaskTag.ts               # Task-tag association model
│   │   └── index.ts
│   ├── services/
│   │   ├── TaskService.ts           # Task management business logic
│   │   ├── TagService.ts            # Tag management business logic
│   │   ├── TaskBlockService.ts      # Blocking relationship management
│   │   ├── TaskTagService.ts        # Task-tag association management
│   │   ├── MetadataService.ts       # Metadata management
│   │   ├── FileService.ts           # File reading
│   │   └── index.ts
│   └── utils/
│       ├── format.ts                # Format utilities
│       ├── cycle-detector.ts        # Circular reference detection
│       ├── input-validators.ts      # Input validation
│       └── security.ts              # Security utilities
├── dist/                            # Build output directory
├── package.json
├── tsconfig.json
└── README.md
```
