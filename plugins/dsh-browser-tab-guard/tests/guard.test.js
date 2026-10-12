/** Behaviour of the tab-ownership policy: navigation stays denied until the Agent owns a tab. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { POLICY_DEFAULTS, createTabOwnershipPolicy } from '../guard.js'

const policy = (overrides = {}) => createTabOwnershipPolicy({ ...POLICY_DEFAULTS, ...overrides })
const agent = name => ({ id: name })
const call = (name, args, who) => ({ name, arguments: args, agent: who })
const succeeded = { isError: false }
const failed = { isError: true }
const NAVIGATE = 'mcp__playwright__browser_navigate'
const TABS = 'mcp__playwright__browser_tabs'

test('denies navigation before the Agent creates a tab', () => {
  const { guard } = policy()
  for (const name of ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_navigate_back', 'mcp__playwright__browser_navigate_forward']) {
    const reason = guard(call(name, { url: 'https://example.com' }, agent('a')))
    assert.equal(typeof reason, 'string')
    assert.match(reason, /browser_tabs/)
    assert.match(reason, /"action":"new"/)
  }
})

test('allows tools that do not move an existing tab', () => {
  const { guard } = policy()
  const who = agent('a')
  assert.equal(guard(call(TABS, { action: 'new' }, who)), undefined)
  assert.equal(guard(call('mcp__playwright__browser_run_code_unsafe', { code: '() => 1' }, who)), undefined)
  assert.equal(guard(call('bash', { command: 'ls' }, who)), undefined)
})

test('allows navigation after a successful new-tab call', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, { action: 'new', url: 'https://example.com' }, who), succeeded)
  assert.equal(guard(call(NAVIGATE, { url: 'https://example.com' }, who)), undefined)
})

test('keeps navigation denied when the new-tab call failed', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, { action: 'new' }, who), failed)
  assert.equal(typeof guard(call(NAVIGATE, {}, who)), 'string')
})

test('denies again after the Agent selects another tab', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, { action: 'new' }, who), succeeded)
  observe(call(TABS, { action: 'select', index: 0 }, who), succeeded)
  assert.equal(typeof guard(call(NAVIGATE, {}, who)), 'string')
})

test('denies again after the Agent closes a tab', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, { action: 'new' }, who), succeeded)
  observe(call(TABS, { action: 'close' }, who), succeeded)
  assert.equal(typeof guard(call(NAVIGATE, {}, who)), 'string')
})

test('keeps ownership per Agent', () => {
  const { guard, observe } = policy()
  const mine = agent('a')
  const other = agent('b')
  observe(call(TABS, { action: 'new' }, mine), succeeded)
  assert.equal(guard(call(NAVIGATE, {}, mine)), undefined)
  assert.equal(typeof guard(call(NAVIGATE, {}, other)), 'string')
})

test('denies navigation that cannot be attributed to an Agent', () => {
  const { guard } = policy()
  assert.equal(typeof guard(call(NAVIGATE, {}, undefined)), 'string')
})

test('clears ownership when the browser closes', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, { action: 'new' }, who), succeeded)
  observe(call('mcp__playwright__browser_close', {}, who), succeeded)
  assert.equal(typeof guard(call(NAVIGATE, {}, who)), 'string')
})

test('ignores malformed tab arguments', () => {
  const { guard, observe } = policy()
  const who = agent('a')
  observe(call(TABS, undefined, who), succeeded)
  observe(call(TABS, 'new', who), succeeded)
  observe(call(TABS, { action: 7 }, who), succeeded)
  observe(call(TABS, {}, who), succeeded)
  assert.equal(typeof guard(call(NAVIGATE, {}, who)), 'string')
})

test('honours a custom prefix, tab tool, and claim action', () => {
  const { guard, observe } = policy({ toolPrefix: 'mcp__browser__', tabsTool: 'tabs', claimAction: 'open' })
  const who = agent('a')
  assert.equal(typeof guard(call('mcp__browser__browser_navigate', {}, who)), 'string')
  observe(call('mcp__browser__tabs', { action: 'open' }, who), succeeded)
  assert.equal(guard(call('mcp__browser__browser_navigate', {}, who)), undefined)
  // Another server's navigation tool belongs to that server, not to this policy.
  assert.equal(guard(call(NAVIGATE, {}, who)), undefined)
})
