# @local/dsh-browser-tab-guard

在 Agent 建立自己的 tab 之前，拒绝浏览器 MCP 对既有 tab 的导航。

## 概述

浏览器 MCP 服务器导航的是当前 tab。当 profile 让该服务器附加到已经打开页面的浏览器时，服务器会把最先注册的页面设为当前 tab。一次 `browser_navigate` 调用就会覆盖那个页面。

本插件在 tools 注册表上注册一个 tool guard（工具守卫）。当当前 tab 不是 Agent 自己创建的 tab 时，守卫拒绝导航类工具。Agent 用 tab 工具创建自己的 tab 后，守卫放行该 tab 内的导航。不移动既有 tab 的工具保持放行，包括 `browser_run_code_unsafe`。

插件按 Agent 记录所有权，因此一个 Session 不会为另一个 Session 授权。Agent 切换或关闭 tab 时，以及浏览器关闭时，所有权复位。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `toolPrefix` | `mcp__playwright__` | 浏览器工具的服务限定前缀 |
| `tabsTool` | `browser_tabs` | tab 管理工具的后缀 |
| `navigationTools` | `browser_navigate`、`browser_navigate_back`、`browser_navigate_forward` | 会把当前 tab 移到其他 URL 的工具 |
| `resetTools` | `browser_close` | 会使 Agent 已建 tab 失效的工具 |
| `claimAction` | `new` | 创建并选中新 tab 的 tab 工具动作 |
| `releaseActions` | `select`、`close` | 可能把当前 tab 移离 Agent tab 的 tab 工具动作 |

每个字段都是经过校验的 `Config` 值，因为部署的 MCP 服务器名和它的工具集随部署而变。

## 拒绝信息

模型收到的是一条失败的工具结果：

```
browser navigation is blocked: the current tab already existed, so navigating it would overwrite that page. Call `mcp__playwright__browser_tabs` with {"action":"new","url":"<target>"} first, then continue in the tab you created.
```

## 限制

- 所有权未知时守卫拒绝导航，包括浏览器完全没有页面时的第一次导航。Agent 先开一个 tab，然后继续。
- 守卫只读取工具名和 tab 工具的 `action`。通过 `browser_run_code_unsafe` 移动 tab 的代码按设计保持放行。
- 所有权存放在内存中，生命周期等于插件加载期。profile 重载会清空所有声明。
