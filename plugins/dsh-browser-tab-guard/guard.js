/**
 * Tab-ownership policy for a browser MCP server.
 *
 * The upstream `browser_navigate` tool navigates the CURRENT tab. When the
 * server attaches to a browser that already holds pages, the first registered
 * page becomes the current tab, so one navigation would overwrite the user's
 * page. This policy denies navigation until the Agent creates its own tab with
 * the tab tool. Operations that do not move an existing tab stay allowed.
 *
 * @module @local/dsh-browser-tab-guard/guard
 */

/**
 * Default tool names and action names for the Playwright MCP server. The
 * profile owns the values; these defaults describe the Playwright server this
 * repository mounts under the `playwright` namespace.
 */
export const POLICY_DEFAULTS = {
  /** Server-qualified tool-name prefix of the browser MCP server. */
  toolPrefix: 'mcp__playwright__',
  /** Tab-management tool suffix. */
  tabsTool: 'browser_tabs',
  /** Tools that move the current tab to another URL. */
  navigationTools: ['browser_navigate', 'browser_navigate_back', 'browser_navigate_forward'],
  /** Tools that invalidate the tab the Agent created. */
  resetTools: ['browser_close'],
  /** Tab-tool action that creates and selects a new tab. */
  claimAction: 'new',
  /** Tab-tool actions that may move the current tab away from the Agent's tab. */
  releaseActions: ['select', 'close'],
}

/**
 * Read the tab tool's `action` from model-supplied arguments.
 * @param args - the parsed tool arguments, which are untrusted model output.
 * @returns the action string, or undefined when the field is absent or not a string.
 */
function actionOf(args) {
  if (typeof args !== 'object' || args === null) return undefined
  const { action } = args
  return typeof action === 'string' ? action : undefined
}

/**
 * Build the ownership state, guard, and completion observer for one policy.
 *
 * State is per Agent, so one Session's tab claim never authorizes another
 * Session. An unattributable navigation is denied, because the guard cannot
 * prove that the current tab belongs to the Agent.
 *
 * @param config - resolved policy configuration.
 * @returns the synchronous {@link ToolGuard} and the `tools/result` observer.
 */
export function createTabOwnershipPolicy(config) {
  const tabsTool = `${config.toolPrefix}${config.tabsTool}`
  const navigationTools = new Set(config.navigationTools.map(name => `${config.toolPrefix}${name}`))
  const resetTools = new Set(config.resetTools.map(name => `${config.toolPrefix}${name}`))
  /** Agents that created a tab while this policy has been loaded. */
  const ownsTab = new WeakMap()

  const remember = (exec, value) => {
    if (exec.agent !== undefined) ownsTab.set(exec.agent, value)
  }

  return {
    /**
     * Deny a navigation that would move a tab the Agent did not create.
     * @param exec - the pending, pre-dispatch call.
     * @returns the model-facing denial reason, or undefined to allow the call.
     */
    guard(exec) {
      if (!navigationTools.has(exec.name)) return undefined
      if (exec.agent !== undefined && ownsTab.get(exec.agent) === true) return undefined
      return `browser navigation is blocked: the current tab already existed, so navigating it would overwrite that page. `
        + `Call \`${tabsTool}\` with {"action":"${config.claimAction}","url":"<target>"} first, then continue in the tab you created.`
    },

    /**
     * Record one completed call that claims or releases the Agent's tab.
     * @param exec - the call that ran.
     * @param result - the settled result; a failed claim keeps the state unchanged.
     */
    observe(exec, result) {
      if (resetTools.has(exec.name)) {
        remember(exec, false)
        return
      }
      if (exec.name !== tabsTool) return
      const action = actionOf(exec.arguments)
      if (action === config.claimAction) {
        if (result.isError !== true) remember(exec, true)
        return
      }
      if (action !== undefined && config.releaseActions.includes(action)) remember(exec, false)
    },
  }
}
