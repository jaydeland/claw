# Database Visualization Refactor Plan

## Overview

Refactor the existing **Database visualization** in the GitHub tree's "Visualize" section to use the **ER diagram table style** instead of flowchart nodes. The `TableNode` component already exists in `visualize-view.tsx` but isn't being used because the AI prompt generates flowchart data.

---

## Current System Analysis

### 1. **Static ER Diagram (Claw Internal DB)**
**Location**: `src/renderer/features/er-diagram/`

- **Data Source**: Hardcoded `clawSchema` in `schema-parser.ts`
- **Generation**: Static - parses the schema at build time
- **Output**: Full ER diagram with all tables, columns, and FK relationships
- **Use Case**: Visualizing Claw's own database structure
- **Style**: Table boxes with column listings, PK/FK indicators

### 2. **Dynamic Analysis Diagrams (Project Analysis)**
**Location**: `src/renderer/features/analyze/` & `src/renderer/features/github/components/visualize-view.tsx`

- **Data Source**: AI-generated via background Claude agent
- **Generation**: Dynamic - spawned via `executeBackgroundTask()`
- **Output**: Flowchart-style diagrams (codeflow, db, architecture, build)
- **Use Case**: High-level analysis of any codebase
- **Current DB Style**: Flowchart nodes (process, decision, data)

### 3. **Key Discovery: TableNode Already Exists!**
**Location**: `src/renderer/features/github/components/visualize-view.tsx:774-876`

The `TableNode` component ALREADY EXISTS and renders:
- ✅ Table header with blue gradient
- ✅ Column listings with data types
- ✅ PK indicator (key icon, amber color)
- ✅ FK indicator (type icon, purple color)
- ✅ Handles for edge connections
- ✅ Proper dark mode support

**Problem**: The AI prompt generates `type: "process"` nodes instead of `type: "table"` nodes with `columns` data.

### 4. **Background Analysis Runner**
**Location**: `src/main/lib/analysis/background-analysis-runner.ts:99-161`

The current `ANALYSIS_PROMPTS.db` generates flowchart data:
- `"type": "process|decision|data"` - flowchart node types
- `"data": { "label": "...", "description": "..." }` - no columns

What's needed: Generate table-style data for the existing `TableNode` component.

---

## Proposed Solution

Update the **existing** `"db"` analysis prompt to generate ER-style table data that the existing `TableNode` component can render.

### Current vs Proposed Output

| Aspect | Current DB Analysis | Proposed DB Analysis |
|--------|---------------------|----------------------|
| **Output Format** | Flowchart (10-20 nodes) | ER Diagram (table nodes) |
| **Node Type** | `"process"`, `"decision"`, `"data"` | `"table"` |
| **Node Data** | `{ label, description, tech }` | `{ label, description, columns[] }` |
| **Visual Style** | Flowchart symbols | Table boxes with columns |
| **Edges** | Generic connections | FK relationships with handles |

### Why Update the Existing Analysis?

The current `db` analysis generates flowchart data showing "data flow patterns" but users clicking "Database" in the visualize tree expect to see the **actual database schema**. The `TableNode` component already exists - we just need to feed it the right data.

**Trade-off**: We lose the "data flow" visualization, but gain a proper ER diagram that matches user expectations.

---

## Implementation Plan

### Phase 1: Update Database Analysis Prompt

**File**: `src/main/lib/analysis/background-analysis-runner.ts`

Replace the existing `ANALYSIS_PROMPTS.db` (lines 99-161) with a new prompt that generates table-style data:

```typescript
db: `Analyze this codebase and generate an ER DIAGRAM showing the database schema.

CRITICAL CONSTRAINTS:
- Identify ALL database tables/collections from the codebase
- Extract column names, types, and constraints from ORM models or schema files
- Map all foreign key relationships between tables
- Format output for TableNode component rendering

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "table-name",
      "type": "table",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "table_name",
        "description": "Brief description of table purpose",
        "columns": [
          {
            "name": "id",
            "type": "uuid",
            "primaryKey": true,
            "foreignKey": null,
            "nullable": false
          },
          {
            "name": "user_id",
            "type": "uuid",
            "primaryKey": false,
            "foreignKey": "users.id",
            "nullable": false
          },
          {
            "name": "email",
            "type": "varchar",
            "primaryKey": false,
            "foreignKey": null,
            "nullable": true
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "fk-users-profile",
      "source": "profiles",
      "target": "users",
      "sourceHandle": "user_id-right",
      "targetHandle": "id-top",
      "type": "smoothstep",
      "label": "user_id"
    }
  ],
  "summary": "Database schema with 12 tables representing user management system",
  "stats": { "tableCount": 12, "relationshipCount": 8 }
}

INSTRUCTIONS:
1. Search for schema files: Prisma schema, Drizzle schema, TypeORM entities, SQL migrations
2. Look for model definitions in src/models, src/entities, or similar
3. Extract actual table names, column names, and types from code
4. Identify primary keys (PK) and foreign keys (FK)
5. Create edges for every FK relationship
6. Set sourceHandle to "{columnName}-right" for FK columns
7. Set targetHandle to "{targetColumnName}-top" for PK target columns
8. Return ONLY valid JSON - no markdown, no code blocks, no explanations

IMPORTANT: The "type" field MUST be "table" for all nodes so the TableNode component renders correctly.`
```

### Phase 2: Update TableNode Data Handling (if needed)

**File**: `src/renderer/features/github/components/visualize-view.tsx:774-876`

The existing `TableNode` component expects data in this format:
```typescript
{
  label: string          // table name
  description?: string   // table description
  columns: Array<{
    name: string
    type: string
    nullable?: boolean
    primaryKey?: boolean
    foreignKey?: string  // format: "table.column"
  }>
}
```

The prompt above matches this format. If there are any mismatches, update the prompt or component as needed.

### Phase 3: Verify Edge Rendering for FK Relationships

**File**: `src/renderer/features/github/components/visualize-view.tsx:171-238`

The edge rendering code already handles FK relationships (lines 191-225):
- Purple color for FK edges
- Cardinality markers
- Handle-based connections

Verify this works with the new prompt output format.

### Phase 4: Update MiniMap Colors (optional)

**File**: `src/renderer/features/github/components/visualize-view.tsx:664-696`

Add `"table"` case to `nodeColor` if not present (line 684 already has it).

### Phase 5: Update PNG Export (optional)

**File**: `src/renderer/features/github/components/visualize-view.tsx:289-592`

The PNG export in `generatePngDataUrl()` handles the flowchart-style nodes. May need to add special handling for table nodes if the columns should be rendered in the PNG export.

---

## Visual Comparison

### Current "db" Flowchart Output
```
[Start] → [Decision: Read/Write?] → [Query Tables] → [Join Relations] → [End]
              ↓
        [Validate Input] → [Update Tables] → [Trigger Events] → [End]
```

### Proposed "er" Diagram Output
```
┌─────────────────┐         ┌─────────────────┐
│     users       │────────▶│    profiles     │
├─────────────────┤   1:1   ├─────────────────┤
│ PK id: uuid     │         │ PK id: uuid     │
│    email: text  │         │    bio: text    │
│ FK profile_id   │         │    avatar: text │
└─────────────────┘         └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│     posts       │
├─────────────────┤
│ PK id: uuid     │
│    title: text  │
│ FK user_id      │
└─────────────────┘
```

---

## Files to Modify

### 1. Backend (Main Process)
**File**: `src/main/lib/analysis/background-analysis-runner.ts`

**Change**: Update `ANALYSIS_PROMPTS.db` (lines 99-161)

This is the **only required change** to get ER-style database diagrams. The prompt update will make the AI generate table nodes instead of flowchart nodes.

### 2. Optional: Update PNG Export for Table Nodes
**File**: `src/renderer/features/github/components/visualize-view.tsx`

**Change**: Enhance `generatePngDataUrl()` to render table-style nodes with columns in the PNG export.

### 3. Optional: Add Layout Algorithm for ER Diagrams
**File**: `src/renderer/features/github/components/visualize-view.tsx`

**Change**: Replace ELK layout with a grid-based layout similar to `ErDiagramView.applyGridLayout()` for better table arrangement.

---

## Reuse Strategy

### What Already Works

1. **`TableNode` component** in `visualize-view.tsx:774-876`
   - ✅ Table header with blue gradient
   - ✅ Column listing with PK/FK indicators
   - ✅ Handles for edge connections
   - ✅ Dark mode support

2. **Node type registration**
   - ✅ `table: TableNode` already in `nodeTypes` (line 888)

3. **Edge rendering for FKs**
   - ✅ Purple color for FK edges (lines 205-210)
   - ✅ Cardinality markers (lines 215-225)
   - ✅ Handle-based connections

4. **MiniMap colors**
   - ✅ `"table"` case already exists (line 684)

### What Needs Updating

1. **AI Prompt** - Only the `ANALYSIS_PROMPTS.db` in `background-analysis-runner.ts`
2. **PNG Export** (optional) - Currently renders flowchart-style nodes
3. **Layout Algorithm** (optional) - ELK layout may not arrange tables optimally

---

## Testing Plan

1. **Prompt Testing**
   - Test the updated `ANALYSIS_PROMPTS.db` with sample codebases
   - Verify AI generates proper `type: "table"` nodes with `columns` array
   - Verify FK relationships are correctly mapped to edges with handles

2. **Visual Testing**
   - Generate database analysis for a project
   - Verify TableNode renders with PK/FK indicators
   - Verify edges connect properly between tables
   - Test dark mode rendering

3. **E2E Testing**
   - Full flow: Select project → Click "Database" in Visualize → See ER diagram

---

## Expected Output Example

### Current Flowchart Output ("db" analysis)
```json
{
  "nodes": [
    { "id": "1", "type": "start", "data": { "label": "User Request" } },
    { "id": "2", "type": "decision", "data": { "label": "Read or Write?" } },
    { "id": "3", "type": "process", "data": { "label": "Query Tables" } }
  ],
  "edges": [...]
}
```

### Proposed ER Diagram Output (same "db" analysis)
```json
{
  "nodes": [
    {
      "id": "users",
      "type": "table",
      "data": {
        "label": "users",
        "description": "User accounts",
        "columns": [
          { "name": "id", "type": "uuid", "primaryKey": true, "nullable": false },
          { "name": "email", "type": "varchar", "primaryKey": false, "nullable": false },
          { "name": "profile_id", "type": "uuid", "primaryKey": false, "foreignKey": "profiles.id", "nullable": true }
        ]
      }
    },
    {
      "id": "profiles",
      "type": "table",
      "data": {
        "label": "profiles",
        "description": "User profiles",
        "columns": [
          { "name": "id", "type": "uuid", "primaryKey": true, "nullable": false },
          { "name": "bio", "type": "text", "primaryKey": false, "nullable": true }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "fk-users-profiles",
      "source": "users",
      "target": "profiles",
      "sourceHandle": "profile_id-right",
      "targetHandle": "id-top",
      "label": "profile_id"
    }
  ]
}
```

---

## Future Enhancements

1. **Hybrid View Toggle**
   - Allow switching between ER diagram (schema) and flowchart (data flow)
   - Store both representations in database

2. **Schema Validation**
   - Validate generated schema against actual database
   - Highlight drift between code and database

3. **Export Formats**
   - PNG/SVG export (already exists, may need enhancement)
   - SQL DDL generation
   - DBML (Database Markup Language)

4. **Interactive Features**
   - Click column to see all references in codebase
   - Filter by table type (lookup, transactional, etc.)
   - Show index information

---

## Summary

This refactor is **simpler than expected** because:

1. ✅ `TableNode` component already exists in `visualize-view.tsx`
2. ✅ The component is already registered as `nodeTypes.table`
3. ✅ Edge handling for FK relationships already exists
4. ✅ Only the **AI prompt** needs to change to generate table data

**Single File Change**: Update `ANALYSIS_PROMPTS.db` in `background-analysis-runner.ts` to generate ER-style output instead of flowchart output.

The existing infrastructure handles the rest - React Flow will automatically render the table nodes when the data has `type: "table"`.
