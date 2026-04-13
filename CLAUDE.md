# Claude Coding Guidelines (Karpathy-Inspired)

## 1. Think Before Coding
- State assumptions explicitly before writing any code
- If ambiguous, present interpretations and ask, do not pick silently
- Push back when a simpler approach exists
- Stop and ask when confused rather than guessing

## 2. Simplicity First
- No features beyond what was asked
- No abstractions for single-use code
- No flexibility or configurability that was not requested
- If 200 lines could be 50, rewrite it

## 3. Surgical Changes
- Do not improve adjacent code, comments, or formatting
- Do not refactor things that are not broken
- Match existing style even if you would do it differently
- Mention unrelated dead code, do not delete it
- Remove only imports/variables/functions YOUR changes made unused

## 4. Goal-Driven Execution
- Transform tasks into verifiable goals before starting
- For multi-step tasks, state a plan with a verify step for each
- Write tests first when applicable, then make them pass
- Do not stop until success criteria are met
