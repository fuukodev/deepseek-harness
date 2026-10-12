# @local/dsh-browser-tab-guard

Deny browser MCP navigation on pre-existing tabs until the Agent creates its own tab.

## Summary

The browser MCP server navigates the current tab. When the profile attaches that server to a browser that already holds pages, the server makes the first registered page the current tab. One `browser_navigate` call then overwrites that page.

This plugin registers a tool guard on the tools registry. The guard denies navigation tools while the current tab is not one the Agent created. The Agent creates its own tab with the tab tool, and the guard then allows navigation in that tab. Tools that do not move an existing tab stay allowed, including `browser_run_code_unsafe`.

The plugin tracks ownership per Agent, so one Session never authorizes another Session. Ownership resets when the Agent selects or closes a tab, and when the browser closes.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `toolPrefix` | `mcp__playwright__` | Server-qualified prefix of the browser tools |
| `tabsTool` | `browser_tabs` | Tab-management tool suffix |
| `navigationTools` | `browser_navigate`, `browser_navigate_back`, `browser_navigate_forward` | Tools that move the current tab to another URL |
| `resetTools` | `browser_close` | Tools that invalidate the tab the Agent created |
| `claimAction` | `new` | Tab-tool action that creates and selects a new tab |
| `releaseActions` | `select`, `close` | Tab-tool actions that may move the current tab away from the Agent's tab |

Every field is a validated `Config` value, because the deployed MCP server name and its tool set vary by deployment.

## Denial message

The model receives the reason as a failed tool result:

```
browser navigation is blocked: the current tab already existed, so navigating it would overwrite that page. Call `mcp__playwright__browser_tabs` with {"action":"new","url":"<target>"} first, then continue in the tab you created.
```

## Limitations

- The guard denies navigation while ownership is unknown, including a first navigation on a browser that holds no page at all. The Agent opens one tab, then continues.
- The guard reads only the tool name and the tab tool's `action`. Code that moves a tab through `browser_run_code_unsafe` stays allowed by design.
- Ownership lives in memory for the lifetime of the loaded plugin. A profile reload clears every claim.
