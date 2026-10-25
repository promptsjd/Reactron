# Reactron: Mandatory Project Rules

You are working on Reactron, a Chrome extension for browser-based games that displays configurable text and GIF/image reactions as overlays.

## 1. Architecture and separation of concerns
- Use modular components, services, and clearly defined interfaces. Each module must have one primary responsibility.
- Reuse existing components, services, validation rules, data models, design tokens, and utilities instead of duplicating them.
- Do not duplicate business logic in UI components or create alternative implementations of existing services.
- Keep the UI, game management, region management, reaction configuration, storage, detection, overlay rendering, and library logic separate.
- UI components must communicate through defined service interfaces rather than directly manipulating unrelated modules or storage internals.
- Avoid monolithic files, circular dependencies, unnecessary abstractions, and premature implementation of future features.

## 2. Contracts and extensibility
- Establish and maintain a single source of truth for shared data models, types, validation, design tokens, and application constants.
- Give modules explicit inputs, outputs, and responsibilities.
- If a future feature needs a module or interface that is not yet implemented, create only the minimal appropriate interface or clearly documented placeholder required by the current scope.
- Do not implement future functionality prematurely or create fake behavior that appears production-ready.
- Do not silently change an existing interface or data schema. Update all dependent modules deliberately and compatibly.

## 3. Scope control
- Implement only the current prompt's scope and explicitly required dependencies.
- Do not introduce unrelated features, alternate workflows, new frameworks, or additional libraries without a justified need.
- Keep existing placeholders and extension points where they support the agreed roadmap.
- Do not claim a feature works unless it has actually been implemented and tested.

## 4. Code quality and project integrity
- Follow the existing technology stack and coding conventions unless a justified architectural issue requires a change.
- Keep files and modules organized by responsibility.
- Handle errors and invalid input at appropriate boundaries.
- Avoid hardcoded game-specific rules, duplicated magic numbers, and assumptions about fixed screen dimensions.
- Use shared configuration and design tokens for values that should remain consistent.
- Keep user data and uploaded media out of source code and avoid unnecessary external network dependencies.
- Preserve the extension's permissions and security boundaries; request only permissions required for implemented functionality.

## 5. Workflow before completion
1. Inspect the existing code and identify reusable modules.
2. State the planned changes and the modules they affect.
3. Implement only the requested scope.
4. Run relevant checks and tests.
5. Report files created or changed, what works, what remains incomplete, and any known limitations.
6. Do not begin the next roadmap stage without explicit instruction.

## 6. Acceptance criteria
Treat the prompt's acceptance criteria as a checklist. Do not mark an item complete without verifying it. If a requirement is technically infeasible or blocked, explain why and propose the smallest compatible alternative rather than silently omitting it.
