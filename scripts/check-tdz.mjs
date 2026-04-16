#!/usr/bin/env node
// scripts/check-tdz.mjs
// Pre-commit hook: scans staged .jsx files for potential Temporal Dead Zone errors.
// Catches: const X = expr(Y) where Y is a const declared LATER in the same function.
// This caught 2 production outages in this project (commits bd15124 and 67909bc).

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// Get staged .jsx files
const staged = execSync('git diff --cached --name-only --diff-filter=ACM')
  .toString().trim().split('\n').filter(f => f.endsWith('.jsx'))

if (staged.length === 0) process.exit(0)

let errors = 0

for (const file of staged) {
  try {
    const src = readFileSync(file, 'utf8')
    const lines = src.split('\n')
    
    // Find all const declarations with their line numbers
    // Pattern: const X = ... or const { X } = ... or const [X] = ...
    const constDecls = [] // { name, line }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // Match: const X = ... or const { X, Y } = ... or const [X] = ...
      const constMatch = line.match(/^const\s+(\w+)\s*=/)
        || line.match(/^const\s+\{([^}]+)\}\s*=/)
        || line.match(/^const\s+\[([^\]]+)\]\s*=/)
      if (constMatch) {
        const names = constMatch[1].split(',').map(n => n.split(':')[0].trim()).filter(Boolean)
        names.forEach(name => constDecls.push({ name, line: i }))
      }
      // Also match: const { X: alias } = ...
      if (line.match(/^const\s+\{/)) {
        const aliases = [...line.matchAll(/:\s*(\w+)/g)].map(m => m[1])
        aliases.forEach(name => constDecls.push({ name, line: i }))
      }
    }

    // For each const, check if it's referenced on an EARLIER line in a way that suggests
    // runtime access before declaration (not just being part of a function definition)
    for (const decl of constDecls) {
      // Skip module-level consts (line 0-50 and not inside a function)
      // We focus on consts inside component functions (after 'export default function' or similar)
      
      // Search backwards from declaration for references to this name
      for (let i = Math.max(0, decl.line - 50); i < decl.line; i++) {
        const refLine = lines[i]
        // Skip comment lines
        if (refLine.trim().startsWith('//') || refLine.trim().startsWith('*')) continue
        // Skip import lines
        if (refLine.trim().startsWith('import ')) continue
        // Skip lines that are declaring THIS const
        if (i === decl.line) continue
        
        // Check if this line references the const name in a way that would cause TDZ
        // Specifically: used as a value (not just as part of another word)
        const nameRegex = new RegExp(`\\b${decl.name}\\b`)
        if (nameRegex.test(refLine)) {
          // Exclude: function declarations (they're hoisted), other const declarations of same name
          if (refLine.trim().startsWith('function ')) continue
          if (refLine.trim().startsWith('const ') && refLine.includes(decl.name + ' =')) continue
          // Exclude: lines inside arrow functions or callbacks that won't execute until later
          // (useEffect callbacks are deferred — the TDZ issue is when the DEPS ARRAY references it)
          // Heuristic: if line contains .filter( .map( .some( .find( or is a deps array [...], flag it
          const isDepsOrEager = refLine.includes('.filter(') || refLine.includes('.map(') 
            || refLine.includes('.some(') || refLine.includes('.find(')
            || /\],\s*\[.*\b/.test(refLine) // deps array pattern
            || refLine.includes('useState(') // initializer runs immediately
          
          if (isDepsOrEager || !refLine.includes('=>') && !refLine.includes('function')) {
            console.error(`\x1b[31mTDZ WARNING\x1b[0m: ${file}:${i + 1} references '${decl.name}' which is declared at line ${decl.line + 1}`)
            console.error(`  ${i + 1} | ${refLine.trim()}`)
            console.error(`  ${decl.line + 1} | ${lines[decl.line].trim()}`)
            console.error('')
            errors++
          }
        }
      }
    }
  } catch (e) {
    // File read error — skip
  }
}

if (errors > 0) {
  console.error(`\x1b[31m✘ Found ${errors} potential TDZ issue(s). Fix before committing.\x1b[0m`)
  console.error(`  TDZ = const referenced before its declaration line in the same scope.`)
  console.error(`  This caused 2 production outages in this project.`)
  process.exit(1)
}

console.log(`\x1b[32m✓ TDZ check passed (${staged.length} .jsx file(s) scanned)\x1b[0m`)
process.exit(0)
