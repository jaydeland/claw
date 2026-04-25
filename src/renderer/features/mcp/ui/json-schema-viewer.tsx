"use client"

import React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: unknown
  [key: string]: unknown
}

/**
 * Type badge component with color coding
 */
function TypeBadge({ type }: { type?: string | string[] }) {
  const typeStr = Array.isArray(type) ? type.join(" | ") : type || "any"

  const colors: Record<string, string> = {
    string: "bg-green-500/10 text-green-600 dark:text-green-400",
    number: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    integer: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    boolean: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    array: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    object: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    null: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  }

  // Get color for first type if multiple
  const primaryType = Array.isArray(type) ? type[0] : type
  const colorClass = colors[primaryType || ""] || "bg-muted text-muted-foreground"

  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", colorClass)}>
      {typeStr}
    </span>
  )
}

/**
 * Single property row in the schema viewer
 */
function SchemaPropertyRow({
  name,
  property,
  isRequired,
  level = 0,
}: {
  name: string
  property: JsonSchemaProperty
  isRequired: boolean
  level?: number
}) {
  // Auto-expand first 2 levels
  const [isExpanded, setIsExpanded] = React.useState(level < 2)

  const hasChildren =
    (property.properties && Object.keys(property.properties).length > 0) ||
    (property.items?.properties && Object.keys(property.items.properties).length > 0)

  const nestedProperties = property.properties || property.items?.properties
  const nestedRequired = property.required || property.items?.required || []

  return (
    <div
      className={cn(
        "py-1.5",
        level > 0 && "border-l-2 border-muted pl-3 ml-1"
      )}
    >
      {/* Property header */}
      <div className="flex items-start gap-2">
        {/* Expand/collapse button for nested properties */}
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-muted rounded mt-0.5 flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-4 flex-shrink-0" /> // Spacer for alignment
        )}

        {/* Property name */}
        <code className="text-xs font-semibold text-foreground">{name}</code>

        {/* Type badge */}
        <TypeBadge type={property.type} />

        {/* Required indicator */}
        {isRequired && (
          <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1 py-0.5 rounded">
            required
          </span>
        )}
      </div>

      {/* Description */}
      {property.description && (
        <p className="text-xs text-muted-foreground mt-1 ml-6 leading-relaxed">
          {property.description}
        </p>
      )}

      {/* Enum values */}
      {property.enum && property.enum.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1 ml-6">
          <span className="font-medium">Allowed values: </span>
          {property.enum.length <= 5 ? (
            property.enum.map((e, i) => (
              <React.Fragment key={i}>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                  {JSON.stringify(e)}
                </code>
                {i < property.enum!.length - 1 && ", "}
              </React.Fragment>
            ))
          ) : (
            <>
              {property.enum.slice(0, 3).map((e, i) => (
                <React.Fragment key={i}>
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    {JSON.stringify(e)}
                  </code>
                  {", "}
                </React.Fragment>
              ))}
              <span className="italic">and {property.enum.length - 3} more...</span>
            </>
          )}
        </div>
      )}

      {/* Default value */}
      {property.default !== undefined && (
        <div className="text-xs text-muted-foreground mt-1 ml-6">
          <span className="font-medium">Default: </span>
          <code className="bg-muted px-1 py-0.5 rounded text-foreground">
            {JSON.stringify(property.default)}
          </code>
        </div>
      )}

      {/* Array item type info */}
      {property.type === "array" && property.items && !property.items.properties && (
        <div className="text-xs text-muted-foreground mt-1 ml-6">
          <span className="font-medium">Items: </span>
          <TypeBadge type={property.items.type} />
          {property.items.description && (
            <span className="ml-1">- {property.items.description}</span>
          )}
        </div>
      )}

      {/* Nested properties */}
      {isExpanded && nestedProperties && (
        <div className="mt-2 ml-2">
          {Object.entries(nestedProperties).map(([key, prop]) => (
            <SchemaPropertyRow
              key={key}
              name={key}
              property={prop as JsonSchemaProperty}
              isRequired={nestedRequired.includes(key)}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * JSON Schema Viewer component
 * Displays a JSON schema in a readable, expandable tree format
 */
export function JsonSchemaViewer({
  schema,
  className,
}: {
  schema: JsonSchemaProperty
  className?: string
}) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground italic", className)}>
        No parameters defined
      </div>
    )
  }

  const required = schema.required || []

  return (
    <div className={cn("space-y-1", className)}>
      {Object.entries(schema.properties).map(([name, property]) => (
        <SchemaPropertyRow
          key={name}
          name={name}
          property={property as JsonSchemaProperty}
          isRequired={required.includes(name)}
          level={0}
        />
      ))}
    </div>
  )
}
