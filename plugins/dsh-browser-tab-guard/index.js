/**
 * Host half of the browser tab guard bundle.
 *
 * It registers one tool guard and one completion observer on the tools
 * registry. The guard denies navigation while the current tab is not one the
 * Agent created. The observer records that claim from the tab tool's results.
 * Policy logic and its state live in `guard.js`.
 *
 * @module @local/dsh-browser-tab-guard
 */

import Schema from '@deepseek-ai/schemastery'
import { POLICY_DEFAULTS, createTabOwnershipPolicy } from './guard.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'browser-tab-guard'

/** The tools registry that owns the guard slot and the result notification. */
export const inject = ['tools']

/**
 * Validated policy configuration. Every field is changeable from the profile,
 * because the deployed MCP server name and its tool set vary by deployment.
 */
export const Config = Schema.object({
  toolPrefix: Schema.string().default(POLICY_DEFAULTS.toolPrefix),
  tabsTool: Schema.string().default(POLICY_DEFAULTS.tabsTool),
  navigationTools: Schema.array(Schema.string()).default(POLICY_DEFAULTS.navigationTools),
  resetTools: Schema.array(Schema.string()).default(POLICY_DEFAULTS.resetTools),
  claimAction: Schema.string().default(POLICY_DEFAULTS.claimAction),
  releaseActions: Schema.array(Schema.string()).default(POLICY_DEFAULTS.releaseActions),
})

/**
 * Register the tab-ownership policy for this profile.
 * @param ctx - plugin context supplying the tools registry.
 * @param config - validated policy configuration.
 */
export function apply(ctx, config) {
  const policy = createTabOwnershipPolicy(config)
  ctx.effect(() => ctx.tools.guard(exec => policy.guard(exec)), 'browser-tab-guard')
  ctx.on('tools/result', (exec, result) => {
    policy.observe(exec, result)
  })
}
