/**
 * Tests for TaskWatcher smart polling optimization
 *
 * These tests verify the optimized polling behavior:
 * - Exponential backoff (5s -> 15s -> 30s -> 60s)
 * - Idle mode when no pending tasks
 * - Wake-up on notifyNewTask()
 * - Status tracking for debugging
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { TaskWatcher } from '../watcher'

describe('TaskWatcher Smart Polling', () => {
  let watcher: TaskWatcher

  beforeEach(() => {
    watcher = new TaskWatcher()
    vi.useFakeTimers()
  })

  afterEach(() => {
    watcher.stop()
    vi.useRealTimers()
  })

  test('should start in non-running state', () => {
    const status = watcher.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.backoffLevel).toBe(0)
    expect(status.consecutiveEmptyChecks).toBe(0)
  })

  test('should set isRunning to true after start()', () => {
    watcher.start()
    const status = watcher.getStatus()
    expect(status.isRunning).toBe(true)
    expect(status.backoffLevel).toBe(0)
  })

  test('should not start twice if already running', () => {
    watcher.start()
    const consoleSpy = vi.spyOn(console, 'log')
    watcher.start()
    expect(consoleSpy).toHaveBeenCalledWith('[TaskWatcher] Already running')
    consoleSpy.mockRestore()
  })

  test('should reset state on stop()', () => {
    watcher.start()
    watcher.stop()
    const status = watcher.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.backoffLevel).toBe(0)
    expect(status.consecutiveEmptyChecks).toBe(0)
  })

  test('should start if not running when notifyNewTask() is called', () => {
    expect(watcher.getStatus().isRunning).toBe(false)
    watcher.notifyNewTask()
    expect(watcher.getStatus().isRunning).toBe(true)
  })

  test('should reset backoff when notifyNewTask() is called', () => {
    watcher.start()
    // Manually set backoff for testing (access private property via cast)
    const watcherAny = watcher as any
    watcherAny.backoffIndex = 3
    watcherAny.consecutiveEmptyChecks = 5

    watcher.notifyNewTask()

    const status = watcher.getStatus()
    expect(status.backoffLevel).toBe(0)
    expect(status.consecutiveEmptyChecks).toBe(0)
  })

  test('should have correct backoff intervals', () => {
    const status = watcher.getStatus()
    // First interval should be 5000ms (5 seconds)
    expect(status.currentInterval).toBe(5000)
  })

  test('should report current interval based on backoff level', () => {
    watcher.start()
    const watcherAny = watcher as any

    // Level 0 = 5000ms
    expect(watcher.getStatus().currentInterval).toBe(5000)

    // Level 1 = 15000ms
    watcherAny.backoffIndex = 1
    expect(watcher.getStatus().currentInterval).toBe(15000)

    // Level 2 = 30000ms
    watcherAny.backoffIndex = 2
    expect(watcher.getStatus().currentInterval).toBe(30000)

    // Level 3 = 60000ms (max)
    watcherAny.backoffIndex = 3
    expect(watcher.getStatus().currentInterval).toBe(60000)
  })
})

describe('TaskWatcher Idle Mode', () => {
  let watcher: TaskWatcher

  beforeEach(() => {
    watcher = new TaskWatcher()
    vi.useFakeTimers()
  })

  afterEach(() => {
    watcher.stop()
    vi.useRealTimers()
  })

  test('should track consecutive empty checks', () => {
    watcher.start()
    const watcherAny = watcher as any

    // Simulate 3 consecutive checks with no pending tasks
    watcherAny.consecutiveEmptyChecks = 2
    expect(watcher.getStatus().consecutiveEmptyChecks).toBe(2)

    watcherAny.consecutiveEmptyChecks = 3
    expect(watcher.getStatus().consecutiveEmptyChecks).toBe(3)
  })
})

describe('TaskWatcher Status Reporting', () => {
  let watcher: TaskWatcher

  beforeEach(() => {
    watcher = new TaskWatcher()
  })

  afterEach(() => {
    watcher.stop()
  })

  test('getStatus() should return complete status object', () => {
    const status = watcher.getStatus()

    expect(status).toHaveProperty('isRunning')
    expect(status).toHaveProperty('backoffLevel')
    expect(status).toHaveProperty('currentInterval')
    expect(status).toHaveProperty('consecutiveEmptyChecks')
    expect(status).toHaveProperty('pendingTaskCount')
  })

  test('pendingTaskCount should be 0 when not running', () => {
    const status = watcher.getStatus()
    expect(status.pendingTaskCount).toBe(0)
  })
})

describe('TaskWatcher Cleanup', () => {
  let watcher: TaskWatcher

  beforeEach(() => {
    watcher = new TaskWatcher()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('should clear timeout on stop()', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    watcher.start()
    watcher.stop()

    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  test('should clear timeout when scheduling new check', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    watcher.start()
    // notifyNewTask() clears existing timeout before scheduling new one
    watcher.notifyNewTask()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })
})
