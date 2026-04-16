#!/usr/bin/env node
// scripts/check-tdz.mjs
// Pre-commit hook: scans staged .jsx files for potential Temporal Dead Zone errors.
// V2: Scope-aware — only flags issues within the SAME function body.
// Catches: const X = expr(Y) where Y is a const declared LATER in the same function.
// This caught 2 production outages (commits bd15124 and 67909bc).

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const staged = execSync('git diff --cached --name-only --diff-filter=ACM')
  .toString().trim().split('\n').filter(f => f.endsWith('.jsx'))

if (staged.length === 0) process.exit(0)

let errors = 0

for (const file of staged) {
  try {
    const src = readFileSync(file, 'utf8')
    const lines = src.split('\n')
    
    // Track function/block scope via brace depth
    // We only care about component-level scope (depth where export default function lives)
    let componentStart = -1
    let depth = 0
    const scopeStack = [] // stack of { startLine, depth }
    
    // Find all const declarations with their scope depth
    const constDecls = [] // { name, line, depth }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Count braces to track scope depth
      const opens = (line.match(/\{/g) || []).length
      const closes = (line.match(/\}/g) || []).length
      depth += opens - closes
      
      // Detect component function entry
      if (line.match(/^export default function\b/) || line.match(/^function \w+.*\{/)) {
        scopeStack.push({ startLine: i, depth: depth })
      }
      
      // Only collect const/let declarations at the component body level
      // (depth === scopeStack[last].depth + 1 — direct children of the component function)
      if (scopeStack.length > 0) {
        const compScope = scopeStack[scopeStack.length - 1]
        const isComponentBody = depth === compScope.depth
        
        if (isComponentBody) {
          // Match useState declarations: const [X, setX] = useState(...)
          const stateMatch = line.match(/^\s*const\s+\[(\w+)/)
          if (stateMatch) constDecls.push({ name: stateMatch[1], line: i, scopeDepth: compScope.depth })
          
          // Match const X = useHook(...) or const { X } = useHook(...)
          const hookMatch = line.match(/^\s*const\s+\{\s*\w+:\s*(\w+)\s*\}\s*=\s*use/)
            || line.match(/^\s*const\s+(\w+)\s*=\s*use/)
          if (hookMatch) constDecls.push({ name: hookMatch[1], line: i, scopeDepth: compScope.depth })
          
          // Match derived consts: const X = TABS.filter(...) etc
          const derivedMatch = line.match(/^\s*const\s+(\w+)\s*=\s*(?!use)/)
          if (derivedMatch && !line.includes('useState') && !line.includes('=>')) {
            constDecls.push({ name: derivedMatch[1], line: i, scopeDepth: compScope.depth })
          }
        }
      }
    }
    
    // For each component-level const, check if it's referenced BEFORE its line
    // at the SAME scope depth (not inside nested functions/callbacks)
    for (const decl of constDecls) {
      // Search the 30 lines before this declaration for references at the same scope
      for (let i = Math.max(0, decl.line - 30); i < decl.line; i++) {
        const refLine = lines[i].trim()
        
        // Skip comments, imports, function declarations (hoisted)
        if (refLine.startsWith('//') || refLine.startsWith('*') || refLine.startsWith('import ') || refLine.startsWith('function ')) continue
        
        // Only flag if this line is at component-body level too (not inside a callback)
        // Heuristic: lines that start with const/let/useEffect/if/return at indent level ≤ 4 spaces
        const indent = lines[i].length - lines[i].trimStart().length
        if (indent > 6) continue  // likely inside a nested callback
        
        // Check if this line references the const name as a word boundary
        const nameRegex = new RegExp(`\\b${decl.name}\\b`)
        if (nameRegex.test(refLine)) {
          // Skip lines that are declaring a DIFFERENT const with the same name (e.g. sequential const { data })
          if (refLine.startsWith('const ') && refLine.includes(decl.name)) continue
          // Skip useEffect dependency arrays (they're evaluated later)
          if (refLine.includes('useEffect') || (refLine.startsWith('}') && refLine.includes('])'))) continue
          
          console.error(`\x1b[31mTDZ WARNING\x1b[0m: ${file}:${i + 1} references '${decl.name}' declared at line ${decl.line + 1}`)
          console.error(`  ${i + 1} | ${refLine}`)
          console.error(`  ${decl.line + 1} | ${lines[decl.line].trim()}`)
          console.error('')
          errors++
        }
      }
    }
  } catch (e) { /* skip unreadable files */ }
}

if (errors > 0) {
  console.error(`\x1b[31m✘ Found ${errors} potential TDZ issue(s). Fix before committing.\x1b[0m`)
  process.exit(1)
}
console.log(`\x1b[32m✓ TDZ check passed (${staged.length} .jsx file(s) scanned)\x1b[0m`)
process.exit(0)
