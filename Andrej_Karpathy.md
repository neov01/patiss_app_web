# Andrej Karpathy 

## Overview
Guidelines derived from Andrej Karpathy's observations to transition AI agents from assumption-heavy "vibe coding" to a disciplined, verifiable engineering process.

## When to Use This Skill
- Before starting any new coding task to ensure requirements are clear.
- When you find yourself proposing large refactors or complex abstractions.
- To enforce a "minimalist" approach to code changes.
- To set up verification loops (tests/validation) for a task.

## Instructions

### 1. Think Before Coding
- **No Assumptions**: If a task is underspecified, STOP and ask for clarification.
- **Tradeoffs**: Explicitly surface technical tradeoffs before implementation.
- **Planning**: Outline the logic in pseudo-code or a plan before writing the actual code.

### 2. Simplicity First
- **Minimal Code**: Write the absolute minimum code required to solve the problem.
- **Avoid Over-Engineering**: Reject speculative features or "just in case" abstractions.
- **YAGNI**: "You Ain't Gonna Need It" is the default rule.

### 3. Surgical Changes
- **Targeted Edits**: Modify only the lines strictly necessary for the task.
- **No Unrelated Refactors**: Do not "clean up" or "improve style" in files or functions outside the scope of the request.
- **Preserve Context**: Maintain existing patterns and documentation integrity.

### 4. Goal-Driven Execution
- **Success Criteria**: Define exactly what "done" looks like before starting.
- **Verification Loops**: Always use tests, logs, or manual verification to prove the fix/feature works.
- **Self-Correction**: If the verification fails, revert to the plan and adjust.

## Limitations
- Do not use this to justify ignoring critical security or performance issues, even if they require more than "minimal" changes.
- Ensure that "simplicity" does not compromise readability for future developers
