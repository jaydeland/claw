/**
 * Tests for parseAnalysisResult function
 *
 * Tests edge cases like:
 * - Empty string input
 * - Invalid JSON
 * - Valid JSON with nodes and edges
 * - Tool output extraction
 * - Markdown code block extraction
 */

// @ts-expect-error - vitest types not installed
import { describe, test, expect } from 'vitest'
import { parseAnalysisResult } from '../analysis-parser'
import type { AnalysisResult } from '../types'

describe('parseAnalysisResult', () => {
  test('should return null for empty string', () => {
    const result = parseAnalysisResult('')
    expect(result).toBeNull()
  })

  test('should return null for whitespace-only string', () => {
    const result = parseAnalysisResult('   \n\t  ')
    expect(result).toBeNull()
  })

  test('should return null for invalid JSON', () => {
    const result = parseAnalysisResult('not valid json')
    expect(result).toBeNull()
  })

  test('should return null for JSON without nodes', () => {
    const result = parseAnalysisResult('{"edges": []}')
    expect(result).toBeNull()
  })

  test('should return null for JSON without edges', () => {
    const result = parseAnalysisResult('{"nodes": []}')
    expect(result).toBeNull()
  })

  test('should return null when nodes is not an array', () => {
    const result = parseAnalysisResult('{"nodes": "invalid", "edges": []}')
    expect(result).toBeNull()
  })

  test('should return null when edges is not an array', () => {
    const result = parseAnalysisResult('{"nodes": [], "edges": "invalid"}')
    expect(result).toBeNull()
  })

  test('should parse valid JSON with nodes and edges', () => {
    const validData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node 1' } }],
      edges: [{ id: 'e1', source: '1', target: '2' }],
      summary: 'Test summary',
      stats: { count: 1 }
    }
    const result = parseAnalysisResult(JSON.stringify(validData))
    expect(result).not.toBeNull()
    expect(result?.nodes).toHaveLength(1)
    expect(result?.edges).toHaveLength(1)
    expect(result?.summary).toBe('Test summary')
    expect(result?.stats).toEqual({ count: 1 })
  })

  test('should extract JSON from markdown code block', () => {
    const validData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node 1' } }],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    }
    const markdown = `Some text before
\`\`\`json
${JSON.stringify(validData)}
\`\`\`
Some text after`
    const result = parseAnalysisResult(markdown)
    expect(result).not.toBeNull()
    expect(result?.nodes).toHaveLength(1)
    expect(result?.edges).toHaveLength(1)
  })

  test('should extract JSON from plain code block', () => {
    const validData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node 1' } }],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    }
    const markdown = `Some text before
\`\`\`
${JSON.stringify(validData)}
\`\`\`
Some text after`
    const result = parseAnalysisResult(markdown)
    expect(result).not.toBeNull()
    expect(result?.nodes).toHaveLength(1)
    expect(result?.edges).toHaveLength(1)
  })

  test('should prefer toolOutput over responseText', () => {
    const toolData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'From Tool' } }],
      edges: [],
    }
    const responseData = {
      nodes: [{ id: '2', type: 'default', position: { x: 0, y: 0 }, data: { label: 'From Response' } }],
      edges: [],
    }
    const result = parseAnalysisResult(JSON.stringify(responseData), JSON.stringify(toolData))
    expect(result).not.toBeNull()
    expect(result?.nodes[0].id).toBe('1')
    expect(result?.nodes[0].data.label).toBe('From Tool')
  })

  test('should handle empty toolOutput and fall back to responseText', () => {
    const responseData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'From Response' } }],
      edges: [],
    }
    const result = parseAnalysisResult(JSON.stringify(responseData), '')
    expect(result).not.toBeNull()
    expect(result?.nodes[0].id).toBe('1')
  })

  test('should handle whitespace-only toolOutput', () => {
    const responseData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'From Response' } }],
      edges: [],
    }
    const result = parseAnalysisResult(JSON.stringify(responseData), '   \n\t  ')
    expect(result).not.toBeNull()
    expect(result?.nodes[0].id).toBe('1')
  })

  test('should handle toolOutput with invalid JSON', () => {
    const responseData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'From Response' } }],
      edges: [],
    }
    const result = parseAnalysisResult(JSON.stringify(responseData), 'invalid json')
    expect(result).not.toBeNull()
    expect(result?.nodes[0].id).toBe('1')
  })

  test('should handle partial JSON (missing closing brace)', () => {
    const partialJson = '{"nodes": [], "edges": []'
    const result = parseAnalysisResult(partialJson)
    expect(result).toBeNull()
  })

  test('should handle nested JSON in text', () => {
    const validData = {
      nodes: [{ id: '1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node 1' } }],
      edges: [],
    }
    const text = `Here's the result: ${JSON.stringify(validData)} and some more text`
    const result = parseAnalysisResult(text)
    expect(result).not.toBeNull()
    expect(result?.nodes).toHaveLength(1)
  })
})
