import { Handle, Position } from "reactflow"
import { Key, Hash, Type } from "lucide-react"
import { memo } from "react"

export interface ColumnData {
  name: string
  type: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  isNotNullable: boolean
  hasDefault: boolean
  foreignKeyTarget?: { table: string; column: string }
}

export interface TableNodeData {
  tableName: string
  columns: ColumnData[]
  description?: string
}

export const TableNode = memo(function TableNode({ data }: { data: TableNodeData }) {
  return (
    <div className="min-w-[220px] shadow-lg rounded-lg bg-white border-2 border-slate-300 dark:border-slate-600 overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-400 border-2 border-slate-500"
        style={{ top: -6 }}
      />

      {/* Table Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 py-2 font-bold text-sm">
        {data.tableName}
      </div>

      {/* Columns */}
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {data.columns.map((col, idx) => (
          <div
            key={col.name}
            className="px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {/* PK Indicator */}
            {col.isPrimaryKey && (
              <div
                className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center"
                title="Primary Key"
              >
                <Key size={10} />
              </div>
            )}

            {/* FK Indicator */}
            {col.isForeignKey && !col.isPrimaryKey && (
              <div
                className="flex-shrink-0 w-4 h-4 rounded-full bg-purple-400 text-white flex items-center justify-center"
                title={`Foreign Key -> ${col.foreignKeyTarget?.table}.${col.foreignKeyTarget?.column}`}
              >
                <Type size={10} />
              </div>
            )}

            {/* Nullable indicator - show dot for nullable, nothing for not null */}
            {!col.isNotNullable && !col.isPrimaryKey && !col.isForeignKey && (
              <div className="flex-shrink-0 w-4" />
            )}

            {/* Column Name */}
            <span className="font-mono text-slate-700 dark:text-slate-300 flex-1 truncate">
              {col.name}
            </span>

            {/* Data Type */}
            <span className="text-slate-400 dark:text-slate-500 text-xs flex-shrink-0">
              {col.type}
            </span>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-400 border-2 border-slate-500"
        style={{ bottom: -6 }}
      />
    </div>
  )
})
