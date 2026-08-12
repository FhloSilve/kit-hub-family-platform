## Permission Request Guidance

Whenever you need my permission for a command, network request, elevated sandbox access, GitHub action, deployment action, or other potentially consequential operation:

- Put your recommendation first: **Allow once**, **Allow for session**, or **Deny**.
- Give the risk level: **Low**, **Medium**, or **High**.
- Briefly explain what the operation does and why you need it.
- State whether it can modify:
  - local files or code
  - GitHub or the remote repository
  - production infrastructure or deployments
  - production/database data
  - secrets, credentials, or authentication
- Prefer the least-privileged option that still lets you complete the task.
- If read-only access is sufficient, do not request write access.
- Never recommend persistent/session-wide permission when **Allow once** is sufficient.

**don't enable “Approve for me” for this.** Leave approvals manual while we're establishing the safety rules. The whole point of the new instructions is for Codex to give you a useful **Allow once / Allow for session / Deny + risk level** recommendation when those prompts occur.

For secrets, destructive commands, production writes, database migrations, authentication/permission changes, infrastructure changes, or irreversible operations, treat the request as higher risk and clearly explain the consequences before asking for approval.

Keep routine permission explanations very short. For example:

> **Recommendation: Allow once — Low risk.**
> Runs the repository's read-only CI checks. It may execute project code locally but does not modify GitHub or production.
