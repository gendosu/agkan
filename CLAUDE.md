- Use comprehensive testing with tests/ and e2etest.sh
- Tests take 15 minutes to run
- git push has hooks configured that run tests
- Follow key-guidelines strictly
- When creating plans in plan mode, use checklist format
- Tags should be applied to the main branch
- Load agkan
- Use agkan for task management
- Write commit messages in English
- Background tasks (sub agents, background Bash) resume the session automatically via completion notifications; do not call tools (e.g. ScheduleWakeup) just to wait — end the turn
  - Never re-run or duplicate a task just because it hasn't finished — duplicate processes are strictly prohibited

## Agkan Tag Guidelines

When creating tasks in agkan, apply the following tags based on task type:

- **board**: Apply this tag to tasks related to the Board feature or Board-related functionality
- **cli**: Apply this tag to tasks related to CLI commands or command-line interface improvements
