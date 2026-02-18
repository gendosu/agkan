# Multilingual Support: Terminology Reference

This file maintains consistent English terminology for all translations in the multilingual support project.

## Business Domain Terminology

### Task Management
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| タスク | task | "Create a new task" | Basic unit of work in the kanban board |
| タスク作成 | task creation | "Task creation process" | Creating new tasks |
| タスク一覧 | task list | "Display task list" | List of all tasks |
| タスク取得 | get task / retrieve task | "Get task by ID" | Retrieving single task |
| タスク更新 | update task / modify task | "Update task status" | Modifying existing task |
| タスク削除 | delete task / remove task | "Delete completed task" | Removing task |

### Status Management
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| ステータス | status | "Current task status" | Task state/condition |
| バックログ | backlog | "Backlog status" | Task status value |
| 準備完了 | ready | "Ready to start" | Task status value |
| 進行中 | in progress | "Task in progress" | Task status value |
| レビュー | review | "Task under review" | Task status value |
| 完了 | done / completed | "Mark as done" | Task status value |
| クローズ | closed | "Closed tasks" | Task status value |
| 状態遷移 | state transition | "Manage state transitions" | Moving between statuses |

### Dependency & Blocking
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| ブロック関係 | blocking relationship | "Define blocking relationships" | Task dependencies |
| ブロッカー | blocker / blocking task | "Remove the blocker" | Task blocking another |
| ブロック済み | blocked | "This task is blocked" | Task being blocked |
| ブロック追加 | add block / add blocker | "Add blocking relationship" | Creating dependency |
| ブロック解除 | remove block / remove blocker | "Remove blocking relationship" | Removing dependency |
| 循環参照 | circular reference / cycle | "Detect circular reference" | Cyclic dependency |
| 自己参照 | self-reference | "Prevent self-reference" | Task blocking itself |

### Tag System
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| タグ | tag | "Add tag to task" | Classification label |
| タグ作成 | create tag | "Create new tag" | Creating tag |
| タグ一覧 | tag list | "List all tags" | Retrieving tags |
| タグ削除 | delete tag | "Delete unused tag" | Removing tag |
| タグ付与 | add tag / tag task | "Add tag to task" | Assigning tag to task |
| タグ解除 | remove tag / untag | "Remove tag from task" | Unassigning tag |
| タグフィルタ | tag filter / filter by tag | "Apply tag filter" | Filtering tasks by tags |
| 重複チェック | duplicate check | "Check for duplicate tags" | Validation |

### Hierarchy & Relationships
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| 親タスク | parent task | "Set parent task" | Parent in hierarchy |
| 子タスク | child task | "List child tasks" | Children in hierarchy |
| 親子関係 | parent-child relationship | "Define parent-child relationship" | Hierarchical structure |
| 階層 | hierarchy / hierarchy structure | "Display task hierarchy" | Task tree structure |
| ツリー表示 | tree view | "Show tree view" | Hierarchical display |

### Metadata System
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| メタデータ | metadata | "Set task metadata" | Custom key-value data |
| メタデータ設定 | set metadata | "Set metadata value" | Setting a metadata entry |
| メタデータ取得 | get metadata | "Get metadata value" | Retrieving a metadata entry |
| メタデータ一覧 | list metadata | "List all metadata" | Listing metadata for a task |
| メタデータ削除 | delete metadata | "Delete metadata entry" | Removing a metadata entry |
| キーと値 | key-value | "Key-value pair" | Metadata storage format |

### Filtering & Search
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| フィルタ | filter | "Apply filter" | Filter criteria |
| フィルタリング | filtering | "Perform filtering" | Process of filtering |
| 絞り込み | narrow down / refine | "Narrow down results" | Reducing result set |
| 検索条件 | search criteria | "Set search criteria" | Filter parameters |

## Technical Terminology

### Database Layer
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| スキーマ | schema | "Database schema" | Database structure |
| テーブル | table | "Create table" | Database table |
| カラム | column | "Add column" | Table column |
| インデックス | index | "Create index" | Database index |
| マイグレーション | migration | "Run migration" | Schema changes |
| 初期化 | initialization / initialize | "Initialize database" | Setting up database |
| リセット | reset | "Reset test database" | Clearing database |
| 接続 | connection | "Database connection" | DB connection |

### Code Structure
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| レイヤー | layer | "Service layer" | Code organization level |
| 層 | layer | "Database layer" | Code organization level |
| モデル | model | "Task model" | Data structure |
| サービス | service | "Task service" | Business logic service |
| インターフェース | interface | "Define interface" | TypeScript interface |
| 型定義 | type definition | "Add type definition" | TypeScript type |
| エクスポート | export | "Export service" | Module export |
| インポート | import | "Import service" | Module import |

### Code Documentation
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| JSDoc | JSDoc comments | "Add JSDoc documentation" | Function documentation format |
| ドキュメンテーション | documentation | "Add documentation" | Code comments |
| コメント | comment | "Add explanatory comment" | Inline comment |
| インラインコメント | inline comment | "Add inline comment" | Comments within code |
| ブロックコメント | block comment | "Add block comment" | Multi-line comment |

### CLI & Commands
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| CLI | command-line interface | "CLI command" | Terminal interface |
| コマンド | command | "Execute command" | CLI command |
| オプション | option / flag | "Add option" | Command option |
| 引数 | argument / parameter | "Pass argument" | Command argument |
| 出力 | output | "Display output" | Command output |
| ユーザー入力 | user input | "Get user input" | Input from user |

### Data Processing
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| 検証 | validation / validate | "Validate input" | Input verification |
| 確認 | check / verify | "Check if exists" | Verification check |
| 変換 | convert / transform | "Convert format" | Data transformation |
| フォーマット | format | "Format date" | Data formatting |
| エンコード | encode | "Encode data" | Data encoding |
| デコード | decode | "Decode data" | Data decoding |

### Testing
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| テスト | test | "Run test" | Testing |
| ユニットテスト | unit test | "Run unit tests" | Unit test type |
| E2Eテスト | end-to-end test / e2e test | "Run e2e tests" | Integration test type |
| テストケース | test case | "Define test case" | Individual test |
| テスト実行 | test execution / run tests | "Execute tests" | Running tests |
| テスト成功 | test passes | "All tests pass" | Test success status |
| テスト失敗 | test fails / test failure | "Test fails" | Test failure status |

### Build & Compilation
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| ビルド | build | "Run build" | Build process |
| コンパイル | compile | "Compile TypeScript" | Source compilation |
| トランスパイル | transpile | "Transpile code" | Code transformation |
| 出力ファイル | output file | "Save output file" | Build artifact |

### Version Management
| Japanese | English | Example Usage | Notes |
|----------|---------|----------------|-------|
| リリース | release | "Release version" | Version release |
| バージョン | version | "Current version" | Version number |
| セマンティックバージョニング | semantic versioning | "Follow semantic versioning" | Version numbering scheme |
| CHANGELOG | CHANGELOG | "Update CHANGELOG" | Version history file |

## Naming Conventions

### File & Directory Names
- Keep as-is: `README`, `CHANGELOG`, `TESTING`, `CLAUDE`
- Keep as-is: `.md` file extension
- Add suffix for Japanese: `.ja.md`
- Directory names: lowercase, hyphen-separated
  - Example: `basic-design.md`, `detailed-design.md`

### Abbreviations
| Japanese | English | Notes |
|----------|---------|-------|
| API | API | Application Programming Interface |
| CRUD | CRUD | Create, Read, Update, Delete |
| SQL | SQL | Structured Query Language |
| CLI | CLI | Command-Line Interface |
| E2E | E2E | End-to-End |
| JSON | JSON | JavaScript Object Notation |
| YAML | YAML | YAML Ain't Markup Language |
| UUID | UUID | Universally Unique Identifier |

## Common Phrases

### Documentation Phrases
| Japanese | English |
|----------|---------|
| はじめに | Getting Started / Introduction |
| インストール | Installation |
| 使用方法 | Usage |
| 機能説明 | Features |
| 設定 | Configuration |
| トラブルシューティング | Troubleshooting |
| FAQ | FAQ / Frequently Asked Questions |
| ライセンス | License |
| 貢献ガイド | Contributing Guide |

### Code Comments
| Japanese | English |
|----------|---------|
| 注: | Note: |
| 警告: | Warning: |
| TODO: | TODO: |
| FIXME: | FIXME: |
| HACK: | HACK: |
| XXX: | XXX: |
| 例: | Example: |
| 参考: | Reference: |

### Error Messages
| Japanese | English |
|----------|---------|
| エラー | Error |
| 警告 | Warning |
| 情報 | Info / Information |
| 成功 | Success |
| 失敗 | Failed / Failure |
| 必須 | Required |
| オプション | Optional |

## Style Guidelines

### Writing Style
1. **Use active voice**: "The service processes the task" (not "The task is processed by the service")
2. **Be concise**: Remove unnecessary words
3. **Use present tense**: "This method creates a task" (not "This method will create a task")
4. **Be specific**: "Validate parent task ID" (not "Check things")
5. **Use consistent terminology**: Always use the mapped English terms

### Comment Format
- **JSDoc**: Use standard JSDoc format
  ```typescript
  /**
   * Create a new task with the specified properties.
   * @param input - Task creation input with title and description
   * @returns Newly created task object
   * @throws Error if title is missing
   */
  ```

- **Inline comments**: Be brief
  ```typescript
  // Validate parent_id: check if parent task exists and is accessible
  ```

### Documentation Format
- Use Markdown formatting
- Include code examples
- Use consistent heading hierarchy
- Include table of contents for long documents

## Usage Notes

- This terminology reference should be consulted before translating any content
- When encountering new Japanese terms, add them to this reference with English equivalents
- For code comments, prioritize clarity and consistency over literal translation
- For documentation, ensure information is accessible to non-native English speakers
- Maintain consistency with industry standard terminology

---

**Last Updated**: 2026-02-18
**For**: Multilingual Support Implementation Project
**Language Pair**: Japanese → English
