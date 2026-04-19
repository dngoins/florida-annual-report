#!/usr/bin/env python3
"""
Claude Agentic Loop for GitHub Issues.

Triggered by GitHub Actions when an issue with the 'agent' label is
opened, labeled, or receives a comment. Runs a tool-use loop where
Claude can read files, create/update files, post comments, open PRs,
and close issues — all via the GitHub CLI and Anthropic API.
"""

import json
import os
import subprocess
import sys
from typing import Any

import anthropic

# ── Environment ──────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
ISSUE_NUMBER = os.environ["ISSUE_NUMBER"]
REPO = os.environ["REPO"]
EVENT_NAME = os.environ.get("EVENT_NAME", "issues")
COMMENT_BODY = os.environ.get("COMMENT_BODY", "")
COMMENT_USER = os.environ.get("COMMENT_USER", "")

MODEL = "claude-opus-4-5"
MAX_ITERATIONS = 15
BOT_LOGINS = {"github-actions[bot]", "copilot[bot]"}
AGENT_BRANCH = f"agent/issue-{ISSUE_NUMBER}"

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ── GitHub helpers ────────────────────────────────────────────────────────────

def gh(*args: str) -> str:
    """Run a gh CLI command and return stdout. Returns error string on failure."""
    result = subprocess.run(
        ["gh", *args],
        capture_output=True,
        text=True,
        env={**os.environ, "GH_TOKEN": GITHUB_TOKEN},
    )
    if result.returncode != 0:
        return f"[gh error] {result.stderr.strip()}"
    return result.stdout.strip()


def get_issue() -> dict:
    """Fetch full issue data including all comments."""
    raw = gh(
        "issue", "view", ISSUE_NUMBER,
        "--repo", REPO,
        "--json", "number,title,body,state,labels,author,comments",
    )
    return json.loads(raw)


def post_comment(body: str) -> str:
    return gh("issue", "comment", ISSUE_NUMBER, "--repo", REPO, "--body", body)


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = f"""You are a senior software engineer AI agent embedded in the GitHub repository `{REPO}`.

You are activated when a GitHub Issue is labeled `agent`. Your job is to:
1. Understand the task described in the issue (and its comment history)
2. Take action using the tools available — read files, write code, create PRs, etc.
3. Post clear progress updates as issue comments so the user is never left wondering
4. When the task is fully complete, close the issue with a summary

## Repository: Florida Annual Report Automation Platform
This system automates Florida Annual Report filings on Sunbiz.org. Before making changes:
- Read `CLAUDE.md` for project conventions and critical constraints
- Read `CONSTITUTION.md` for governing principles
- Check `docs/reference/` for authoritative specs
- Sunbiz has NO public API — submissions use Playwright browser automation
- Never submit without explicit user approval (`user_approved: true`)
- Audit log every action — append-only writes to `audit_logs`

## Rules
- **Start** every run by posting a comment acknowledging the task
- **Post progress** comments for multi-step work (never go silent for > 2 tool calls)
- **Never commit secrets** — use environment variables or Azure Key Vault references
- **Follow CONSTITUTION.md** — especially Compliance-First and Human-in-the-Loop principles
- **Test-first** — write tests before implementation for any code changes
- **Close the issue** when the task is complete using the `close_issue` tool
- If you cannot complete a task, add the `needs-human` label, explain why, and stop
- Maximum {MAX_ITERATIONS} iterations per run — be efficient
"""


# ── Tool definitions ──────────────────────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "name": "post_issue_comment",
        "description": (
            "Post a Markdown comment on the current GitHub issue. "
            "Use to acknowledge tasks, report progress, ask clarifying questions, or summarise results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "string", "description": "Markdown content of the comment."},
            },
            "required": ["body"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file in the repository.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Repo-relative file path."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": "List immediate children of a directory (non-hidden, max depth 1).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Repo-relative path. Use '.' for the root.",
                    "default": ".",
                },
            },
            "required": [],
        },
    },
    {
        "name": "run_shell",
        "description": (
            "Run a read-only shell command such as grep, find, cat, or wc. "
            "Do NOT use for destructive operations — use create_or_update_file for writes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to execute."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "create_or_update_file",
        "description": (
            "Create a new file or overwrite an existing file, then commit and push to the "
            f"agent branch `{AGENT_BRANCH}`. "
            "Always include a clear commit message."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Repo-relative path to write."},
                "content": {"type": "string", "description": "Full file content."},
                "commit_message": {"type": "string", "description": "Git commit message."},
            },
            "required": ["path", "content", "commit_message"],
        },
    },
    {
        "name": "create_pull_request",
        "description": (
            "Open a pull request from the agent branch into `main`. "
            "Call this after you have committed all necessary file changes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "PR title."},
                "body": {"type": "string", "description": "PR description in Markdown."},
            },
            "required": ["title", "body"],
        },
    },
    {
        "name": "add_label",
        "description": "Add a label to the current issue (e.g., 'needs-human', 'in-progress').",
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Exact label name to add."},
            },
            "required": ["label"],
        },
    },
    {
        "name": "close_issue",
        "description": (
            "Close the current issue. Always post a final summary comment before closing. "
            "Use reason='completed' when the task is done, 'not_planned' if it will not be done."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Final comment to post summarising what was done.",
                },
                "reason": {
                    "type": "string",
                    "enum": ["completed", "not_planned"],
                    "default": "completed",
                },
            },
            "required": ["summary"],
        },
    },
]


# ── Tool execution ────────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict) -> tuple[str, bool]:
    """
    Execute a tool call.
    Returns (result_string, should_stop).
    should_stop=True causes the loop to exit after this tool.
    """
    try:
        if name == "post_issue_comment":
            result = post_comment(inputs["body"])
            return result or "Comment posted.", False

        elif name == "read_file":
            path = inputs["path"]
            try:
                with open(path, encoding="utf-8") as f:
                    content = f.read()
                # Cap very large files to avoid blowing context
                if len(content) > 20_000:
                    content = content[:20_000] + "\n\n[... truncated at 20,000 chars ...]"
                return content, False
            except FileNotFoundError:
                return f"Error: file not found: {path}", False

        elif name == "list_directory":
            path = inputs.get("path", ".")
            result = subprocess.run(
                ["find", path, "-maxdepth", "1", "-not", "-name", ".*", "-not", "-path", path],
                capture_output=True,
                text=True,
            )
            return result.stdout.strip() or "(empty)", False

        elif name == "run_shell":
            result = subprocess.run(
                inputs["command"],
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = (result.stdout + result.stderr).strip()
            return (output[:8_000] if output else "(no output)"), False

        elif name == "create_or_update_file":
            path = inputs["path"]
            content = inputs["content"]
            message = inputs["commit_message"]

            # Ensure agent branch exists
            subprocess.run(
                ["git", "fetch", "origin", "--depth=1"],
                capture_output=True,
            )
            checkout = subprocess.run(
                ["git", "checkout", "-B", AGENT_BRANCH],
                capture_output=True,
                text=True,
            )
            if checkout.returncode != 0:
                return f"Error creating branch: {checkout.stderr}", False

            # Write file
            dir_name = os.path.dirname(path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            # Stage, commit, push
            subprocess.run(["git", "add", path], capture_output=True)
            commit = subprocess.run(
                [
                    "git", "commit", "-m",
                    f"{message}\n\nResolves #{ISSUE_NUMBER}\n\n"
                    "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
                ],
                capture_output=True,
                text=True,
            )
            if "nothing to commit" in commit.stdout + commit.stderr:
                return "No changes to commit (file content unchanged).", False

            push = subprocess.run(
                ["git", "push", "--force-with-lease", "--set-upstream", "origin", AGENT_BRANCH],
                capture_output=True,
                text=True,
                env={**os.environ, "GH_TOKEN": GITHUB_TOKEN},
            )
            if push.returncode != 0:
                return f"Error pushing: {push.stderr}", False

            return f"✅ `{path}` written and pushed to branch `{AGENT_BRANCH}`.", False

        elif name == "create_pull_request":
            result = gh(
                "pr", "create",
                "--repo", REPO,
                "--title", inputs["title"],
                "--body", inputs["body"],
                "--head", AGENT_BRANCH,
                "--base", "main",
            )
            return result or "PR created.", False

        elif name == "add_label":
            result = gh(
                "issue", "edit", ISSUE_NUMBER,
                "--repo", REPO,
                "--add-label", inputs["label"],
            )
            return result or f"Label '{inputs['label']}' added.", False

        elif name == "close_issue":
            summary = inputs.get("summary", "")
            reason = inputs.get("reason", "completed")
            if summary:
                post_comment(summary)
            gh("issue", "close", ISSUE_NUMBER, "--repo", REPO, "--reason", reason)
            return f"Issue #{ISSUE_NUMBER} closed ({reason}).", True

        return f"Unknown tool: {name}", False

    except Exception as exc:  # noqa: BLE001
        return f"[tool error] {name}: {exc}", False


# ── Agentic loop ──────────────────────────────────────────────────────────────

def build_initial_message(issue: dict) -> str:
    labels = [label["name"] for label in issue.get("labels", [])]
    lines = [
        f"# Issue #{issue['number']}: {issue['title']}",
        f"**Author:** {issue['author']['login']}  ",
        f"**Labels:** {', '.join(labels)}  ",
        f"**State:** {issue['state']}",
        "",
        "## Description",
        issue.get("body") or "_No description provided._",
    ]

    comments = issue.get("comments", [])
    if comments:
        lines += ["", "## Comment History"]
        for c in comments:
            lines += [f"\n---\n**{c['author']['login']}** wrote:\n", c["body"]]

    if EVENT_NAME == "issue_comment" and COMMENT_BODY:
        lines += [
            "",
            f"> **Latest comment from @{COMMENT_USER}:**",
            f"> {COMMENT_BODY}",
        ]

    return "\n".join(lines)


def main() -> None:
    # Guard: skip bot-originated comments (already filtered in workflow, but belt-and-suspenders)
    if EVENT_NAME == "issue_comment" and COMMENT_USER in BOT_LOGINS:
        print(f"Skipping — comment author '{COMMENT_USER}' is a bot.")
        sys.exit(0)

    issue = get_issue()
    labels = {label["name"] for label in issue.get("labels", [])}

    if "agent" not in labels:
        print("Issue does not carry the 'agent' label. Skipping.")
        sys.exit(0)

    print(f"▶ Starting agent loop for issue #{ISSUE_NUMBER}: {issue['title']}")

    initial_message = build_initial_message(issue)
    messages: list[dict[str, Any]] = [{"role": "user", "content": initial_message}]

    for iteration in range(1, MAX_ITERATIONS + 1):
        print(f"\n── Iteration {iteration}/{MAX_ITERATIONS} ──")

        response = client.messages.create(
            model=MODEL,
            max_tokens=8096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        # Append assistant turn
        messages.append({"role": "assistant", "content": response.content})

        stop_reason = response.stop_reason
        print(f"stop_reason: {stop_reason}")

        if stop_reason == "end_turn":
            print("Claude finished naturally (end_turn).")
            break

        if stop_reason != "tool_use":
            print(f"Unexpected stop_reason '{stop_reason}' — stopping.")
            break

        # Collect and execute all tool calls in this turn
        tool_results: list[dict] = []
        should_stop = False

        for block in response.content:
            if block.type != "tool_use":
                continue

            print(f"  tool: {block.name}  inputs: {json.dumps(block.input)[:160]}")
            result_text, stop = execute_tool(block.name, block.input)
            preview = result_text[:120].replace("\n", " ")
            print(f"  result: {preview}")

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result_text,
            })

            if stop:
                should_stop = True

        # Feed tool results back to Claude
        messages.append({"role": "user", "content": tool_results})

        if should_stop:
            print("Agent closed the issue — stopping loop.")
            break

    else:
        # Safety net: max iterations reached without close
        print("⚠ Max iterations reached without closing the issue.")
        post_comment(
            "⚠️ **Agent reached the maximum iteration limit** without completing the task.\n\n"
            "Please review the work done so far and add a follow-up comment to continue, "
            "or remove the `agent` label and handle manually."
        )
        gh("issue", "edit", ISSUE_NUMBER, "--repo", REPO, "--add-label", "needs-human")

    print("\n✓ Agent loop complete.")


if __name__ == "__main__":
    main()
