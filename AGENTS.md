## AI Coding Assistants

This file provides context and rules for AI coding agents working on the **wooPortal** project (a Chrome Extension built with Vite and TypeScript).

### Core Principle
Any AI agent working on this codebase **must** deeply understand the full project before answering questions or making changes. Do not rely on assumptions or partial knowledge. Explore the actual files and architecture.

### Expected Behavior
- Be **proactive and maximally thorough**. Do not give high-level or superficial answers.
- Always ground responses in real code from the repository. Explicitly reference files and key sections when relevant.
- Surface cross-file connections, patterns, and potential side effects of changes (especially considering Manifest V3 restrictions, service worker lifecycle, and browser APIs).
- Follow existing conventions and architecture decisions in the project (strict TypeScript, Vanilla JS/DOM for UI, D3 for the globe).
- When in doubt, explore more of the codebase rather than guessing.

### Mandatory First Step (Deep Project Analysis)
Before working on tasks or answering detailed questions, the agent should:

1. Analyze the complete directory structure, specifically distinguishing between `/src/background`, `/src/popup`, and `/src/options`.
2. Thoroughly review all configuration and dependency files (`manifest.json`, `package.json`, `tsconfig.json`, and all `vite.config.*.ts` files).
3. Understand the messaging flows (`BgMessage`, `BgState` in `types.ts`), extension storage (`WooPortalData`), and how APIs like `chrome.debugger` or `chrome.proxy` are utilized.
4. Build a clear mental model of the extension architecture, key modules, and data flows.

The agent is encouraged to refer to or update the `PROJECT_BIBLE.md` (or similar internal knowledge base) during interactions.

### Development Workflow
- The project is built using Vite with three separate configs. Use commands like `npm run build` or `npm run dev:popup` as needed.
- Be mindful of Manifest V3 requirements: the background script is a Service Worker and can be terminated. Do not rely on persistent global variables for crucial state without backing it up in `chrome.storage.local`.
- Any UI changes to the popup or options page should be done using Vanilla TypeScript and CSS, without introducing new frontend frameworks (React/Vue/etc.) unless explicitly instructed.
- Ensure changes are covered by tests using `vitest` when applicable.

### For Gemini Users (Google AI Studio)
For the best deep analysis of the entire project:
1. Create a clean ZIP of the repository (exclude `node_modules`, `.git`, `dist`).
2. Upload the ZIP to a new chat in Google AI Studio using **Gemini 3.1 Pro** (or the strongest available Pro model).
3. Start with a detailed prompt instructing the model to perform full codebase exploration and create a structured project overview before proceeding with any specific task.

### General Rules
- Prefer editing and extending existing components and patterns rather than introducing new unrelated approaches.
- When proposing changes, clearly explain the reasoning and impact on other parts of the extension.
- After significant modifications, suggest updates to relevant documentation if needed.
