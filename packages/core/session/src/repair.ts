/**
 * Crash-recovery repair for an interrupted session log. It preserves a fully
 * written final turn and supplies the missing tool, step, and turn boundaries
 * needed to resume with a provider-valid transcript; a log whose finished turns
 * already contain an unanswered tool call is reported as unrepairable rather
 * than silently served.
 * @module @deepseek-ai/dsh-session/repair
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { MessageId, ToolCallId, ToolResultMessage } from '@deepseek-ai/dsh-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { SessionSeq } from './types.ts'
import type { SessionEvent, SessionSeq as SessionSeqType } from './types.ts'

/** Recovery code for an assistant tool request that never reached a recorded call start. */
export const TOOL_NOT_STARTED = 'TOOL_NOT_STARTED'

/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
export const TOOL_OUTCOME_UNKNOWN = 'TOOL_OUTCOME_UNKNOWN'

/**
 * Model-visible result text for a call the Harness never recorded as started.
 * Shared with the agent loop so both recovery routes present one wording.
 */
export const TOOL_NOT_STARTED_TEXT =
  'The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.'

/**
 * Model-visible result text for a recorded call whose outcome was never durably
 * recorded. Shared with the agent loop so both recovery routes present one wording.
 */
export const TOOL_OUTCOME_UNKNOWN_TEXT =
  'The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.'

/** One recorded tool call that never received a durable result. */
export interface UnclosedToolCall {
  /** Assistant-visible call identity. */
  readonly callId: ToolCallId
  /** Turn that recorded the call or its request. */
  readonly turn: number
  /** Step that recorded the call or its request. */
  readonly step: number
  /** Seq of the `tool/call` event when the Harness recorded the call start; absent when only the request was recorded. */
  readonly callSeq?: SessionSeqType
}

/**
 * List every tool call the log records without a matching `tool/result`, in log
 * order. Unlike {@link interruptedTurnClosers}, this scans the whole log rather
 * than the open tail: a call left unanswered inside a finished turn cannot be
 * closed by appending (the result would follow later messages), so a caller that
 * must serve a provider-valid transcript has to refuse the log instead.
 *
 * @param events - the durable log to scan, alone or already extended with synthetic closers.
 * @returns one entry per unclosed call, in the order the calls appear.
 */
export function unclosedToolCalls(events: readonly SessionEvent[]): UnclosedToolCall[] {
  const pending = new Map<ToolCallId, UnclosedToolCall>()
  for (const event of events) {
    switch (event.type) {
      case 'assistant/message':
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call') {
            pending.set(block.id, { callId: block.id, turn: event.data.turn, step: event.data.step })
          }
        }
        break
      case 'tool/call': {
        const request = pending.get(event.data.callId)
        if (request) {
          pending.set(event.data.callId, { ...request, callSeq: event.seq })
        }
        break
      }
      case 'tool/result':
        pending.delete(event.data.message.source.callId)
        break
      // Other event types carry no call boundary.
      default:
        break
    }
  }
  return [...pending.values()]
}

/**
 * Return deterministic synthetic events that close an open tail turn. Unmatched
 * calls receive error results first, followed by an open `step/end` and an
 * interrupted `turn/end`; sequences continue the log and timestamps reuse the
 * last real event. A balanced or empty log returns no events.
 *
 * @param events - the loaded durable log to scan (a valid committed prefix, possibly with a crash tail).
 * @returns the synthetic closer events to append after `events`, in order; empty when the log is already balanced.
 */
export function interruptedTurnClosers(events: readonly SessionEvent[]): SessionEvent[] {
  let openTurn: number | null = null
  let openStep: number | null = null
  // Reset at each turn boundary so earlier calls cannot leak into tail repair.
  // Assistant blocks register calls; later `tool/call` events add their seqs to `sourceEventSeqs`.
  const pendingCalls = new Map<ToolCallId, { step: number; callSeq?: SessionSeqType }>()
  for (const event of events) {
    switch (event.type) {
      case 'turn/start':
        openTurn = event.data.turn
        openStep = null
        pendingCalls.clear()
        break
      case 'turn/end':
        openTurn = null
        openStep = null
        pendingCalls.clear()
        break
      case 'step/start':
        openStep = event.data.step
        break
      case 'step/end':
        pendingCalls.clear()
        openStep = null
        break
      case 'assistant/message':
        // The assistant message carries the tool-call blocks; each is pending
        // until a tool/result event with the same callId is logged.
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call') pendingCalls.set(block.id, { step: event.data.step })
        }
        break
      case 'tool/call':
        // Cite the `tool/call` seq from the synthetic result.
        {
          const entry = pendingCalls.get(event.data.callId)
          if (entry) {
            entry.callSeq = event.seq
          }
        }
        break
      case 'tool/result':
        pendingCalls.delete(event.data.message.source.callId)
        break
      // Other event types do not move the turn/step boundary cursor.
      default:
        break
    }
  }

  // Balanced log (no crash mid-turn): nothing to close. An open turn implies
  // `events` is non-empty (its turn/start was logged), so `last` exists.
  const last = events.at(-1)
  if (openTurn === null || last === undefined) return []

  // The last real event supplies the seq base and the timestamp for the
  // synthetic closers (reusing the last timestamp keeps them deterministic and
  // never invents a "future" time).
  let seq = last.seq + 1
  const time = last.time
  const closers: SessionEvent[] = []

  // Close calls before their step: providers reject dangling assistant calls,
  // and Map insertion order preserves their transcript order.
  for (const [callId, { step, callSeq }] of pendingCalls) {
    const started = callSeq !== undefined
    const message: ToolResultMessage = deepFreeze({
      id: brandString<MessageId>(`interrupted-tool-result-${callId}-${seq}`),
      role: 'user',
      source: { kind: 'tool', callId },
      content: [{
        type: 'tool-result',
        toolCallId: callId,
        isError: true,
        content: [{
          type: 'text',
          text: started ? TOOL_OUTCOME_UNKNOWN_TEXT : TOOL_NOT_STARTED_TEXT,
        }],
      }],
    })
    closers.push({
      type: 'tool/result',
      seq: SessionSeq(seq++),
      time,
      data: {
        turn: openTurn,
        step,
        message,
        error: started
          ? { name: 'ToolOutcomeUnknownError', code: TOOL_OUTCOME_UNKNOWN }
          : { name: 'ToolNotStartedError', code: TOOL_NOT_STARTED },
      },
      surfaceOp: 'append',
      ...started ? { sourceEventSeqs: [callSeq] } : {},
    })
  }

  // Close an open step next — a turn/end while a step is open is an invariant
  // violation, so the step's boundary must be synthesized before the turn's.
  if (openStep !== null) {
    closers.push({ type: 'step/end', seq: SessionSeq(seq++), time, data: { turn: openTurn, step: openStep } })
  }
  closers.push({ type: 'turn/end', seq: SessionSeq(seq++), time, data: { turn: openTurn, reason: { kind: 'interrupted' } } })
  return closers
}
