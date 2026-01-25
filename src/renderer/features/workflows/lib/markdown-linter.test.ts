/**
 * Tests for markdown-linter.ts
 */

import { describe, expect, test } from "bun:test"
import { lintWorkflowFile, getLintStatusSummary } from "./markdown-linter"

describe("lintWorkflowFile", () => {
  describe("skill/command validation", () => {
    test("validates valid skill frontmatter", () => {
      const content = `---
name: my-skill
description: A valid skill description
allowed-tools: Read, Grep, Glob
model: sonnet
---

# My Skill

Instructions here.
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    test("warns about missing description", () => {
      const content = `---
name: my-skill
---

# My Skill
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.warnings.some(w => w.field === "description")).toBe(true)
    })

    test("errors on invalid model value", () => {
      const content = `---
name: my-skill
description: test
model: invalid-model
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.errors.some(e => e.field === "model")).toBe(true)
    })

    test("accepts valid model values", () => {
      for (const model of ["sonnet", "opus", "haiku", "inherit"]) {
        const content = `---
name: test
description: test
model: ${model}
---

Content
`
        const result = lintWorkflowFile(content, "skill")
        const modelErrors = result.errors.filter(e => e.field === "model")
        expect(modelErrors).toHaveLength(0)
      }
    })

    test("validates tool names", () => {
      const content = `---
name: test
description: test
allowed-tools:
  - Read
  - Write
  - InvalidTool
  - mcp__server__tool
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      // Should warn about InvalidTool
      expect(result.warnings.some(w => w.message.includes("InvalidTool"))).toBe(true)

      // Should not warn about valid tools
      expect(result.warnings.some(w => w.message.includes("Read"))).toBe(false)
      expect(result.warnings.some(w => w.message.includes("mcp__server__tool"))).toBe(false)
    })

    test("validates context: fork", () => {
      const content = `---
name: test
description: test
context: fork
agent: Explore
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.errors.filter(e => e.field === "context")).toHaveLength(0)
      expect(result.warnings.filter(w => w.field === "agent")).toHaveLength(0)
    })

    test("warns when agent set without context: fork", () => {
      const content = `---
name: test
description: test
agent: Explore
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.warnings.some(w => w.field === "agent")).toBe(true)
    })

    test("validates boolean fields", () => {
      const content = `---
name: test
description: test
disable-model-invocation: "yes"
user-invocable: "no"
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.errors.some(e => e.field === "disable-model-invocation")).toBe(true)
      expect(result.errors.some(e => e.field === "user-invocable")).toBe(true)
    })

    test("accepts true/false for booleans", () => {
      const content = `---
name: test
description: test
disable-model-invocation: true
user-invocable: false
---

Content
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.errors.filter(e =>
        e.field === "disable-model-invocation" || e.field === "user-invocable"
      )).toHaveLength(0)
    })
  })

  describe("agent validation", () => {
    test("validates valid agent frontmatter", () => {
      const content = `---
name: my-agent
description: A valid agent description
tools: Read, Grep, Glob
model: sonnet
---

# My Agent

Instructions here.
`
      const result = lintWorkflowFile(content, "agent")

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    test("validates permissionMode values", () => {
      const validModes = ["default", "acceptEdits", "dontAsk", "bypassPermissions", "plan"]

      for (const mode of validModes) {
        const content = `---
name: test
description: test
permissionMode: ${mode}
---

Content
`
        const result = lintWorkflowFile(content, "agent")
        expect(result.errors.filter(e => e.field === "permissionMode")).toHaveLength(0)
      }
    })

    test("errors on invalid permissionMode", () => {
      const content = `---
name: test
description: test
permissionMode: invalidMode
---

Content
`
      const result = lintWorkflowFile(content, "agent")

      expect(result.errors.some(e => e.field === "permissionMode")).toBe(true)
    })

    test("validates skills array", () => {
      const content = `---
name: test
description: test
skills:
  - skill-one
  - skill-two
---

Content
`
      const result = lintWorkflowFile(content, "agent")

      expect(result.errors.filter(e => e.field === "skills")).toHaveLength(0)
    })
  })

  describe("markdown content validation", () => {
    test("warns about unclosed code blocks", () => {
      const content = `---
name: test
description: test
---

# Test

\`\`\`javascript
console.log("hello")
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.warnings.some(w => w.message.includes("Unclosed code block"))).toBe(true)
    })

    test("warns about multiple H1 headings", () => {
      const content = `---
name: test
description: test
---

# First Heading

# Second Heading

# Third Heading
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.warnings.filter(w => w.message.includes("Multiple H1")).length).toBeGreaterThan(0)
    })
  })

  describe("missing frontmatter", () => {
    test("warns about missing frontmatter delimiter", () => {
      const content = `# Just Content

No frontmatter here.
`
      const result = lintWorkflowFile(content, "skill")

      expect(result.warnings.some(w => w.field === "frontmatter")).toBe(true)
    })
  })
})

describe("getLintStatusSummary", () => {
  test("returns valid status when no issues", () => {
    const result = { valid: true, errors: [], warnings: [], info: [] }
    const summary = getLintStatusSummary(result)

    expect(summary.status).toBe("valid")
    expect(summary.text).toBe("Valid")
  })

  test("returns errors status when errors present", () => {
    const result = {
      valid: false,
      errors: [{ severity: "error" as const, message: "Error 1" }],
      warnings: [],
      info: [],
    }
    const summary = getLintStatusSummary(result)

    expect(summary.status).toBe("errors")
    expect(summary.text).toBe("1 error")
  })

  test("returns warnings status when only warnings present", () => {
    const result = {
      valid: true,
      errors: [],
      warnings: [{ severity: "warning" as const, message: "Warning 1" }],
      info: [],
    }
    const summary = getLintStatusSummary(result)

    expect(summary.status).toBe("warnings")
    expect(summary.text).toBe("1 warning")
  })

  test("pluralizes correctly", () => {
    const result = {
      valid: false,
      errors: [
        { severity: "error" as const, message: "Error 1" },
        { severity: "error" as const, message: "Error 2" },
      ],
      warnings: [],
      info: [],
    }
    const summary = getLintStatusSummary(result)

    expect(summary.text).toBe("2 errors")
  })
})
