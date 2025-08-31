## Zed Codebase Analysis Report

### 1. Introduction

Zed is a high-performance, multiplayer code editor written in Rust. Its architecture is designed for speed, real-time collaboration, and extensibility. The project is a large Rust workspace composed of many specialized crates, a separate backend server for collaboration, and a rich ecosystem of extensions and configuration assets. This report provides a detailed breakdown of the codebase, based on an analysis of its key directories and files.

### 2. High-Level Architecture

The overall architecture of Zed can be understood by examining the root of the repository:

*   **Rust Workspace**: The `Cargo.toml` at the root defines a large workspace containing dozens of crates. This modular structure separates concerns, with dedicated crates for the UI framework, editor logic, networking, language support, and various features.
*   **Client-Server Model**: Zed operates on a client-server model, even for local development.
    *   **The Zed Editor (Client)**: The main desktop application that users interact with.
    *   **`collab` Server (Backend)**: A standalone `axum`-based web server that powers all real-time collaboration, project sharing, and other backend services.
*   **Local Development Environment**: The `compose.yml` file defines a Docker-based local development environment that mirrors the production setup. It includes:
    *   A **PostgreSQL** database for data persistence.
    *   A **Minio** S3-compatible object store for blob storage.
    *   A **LiveKit** server for WebRTC-based real-time communication.
    *   **PostgREST** to automatically generate a REST API from the database schema.
*   **Rust Toolchain**: The `rust-toolchain.toml` file pins the project to a specific Rust version (`1.89`), ensuring a consistent build environment for all developers.

### 3. Core Crates (`crates/`)

The `crates/` directory contains the heart of the Zed application. Each crate has a specific responsibility:

*   **`gpui`**: This is Zed's custom, in-house, **GPU-accelerated UI framework**. It is written from scratch in Rust and is fundamental to the editor's performance. It uses a hybrid immediate and retained mode architecture and provides a declarative, component-based API similar to modern web frameworks.
*   **`workspace`**: This crate manages the main application window and the overall workspace state. It uses `gpui` to build the main UI, including panes, docks, and the status bar. It defines the `Item` trait for things that can be displayed in a pane (like an editor or a terminal) and handles a wide range of user actions.
*   **`editor`**: This crate implements the core text editing component. It manages the text buffer (using a `Rope` data structure for efficient edits), handles multiple cursors and selections, and integrates with the language and theme systems for features like syntax highlighting.
*   **`zed`**: This is the main application crate that builds the final executable. It serves as the entry point, initializes all other crates and services, parses command-line arguments, and launches the initial workspace window.
*   **`collab`**: This is the **backend server** for Zed's real-time collaboration features. It is a completely separate application from the editor client. Written using the `axum` web framework, it handles user authentication, project sharing, real-time synchronization of edits, and other API services. It is licensed under the AGPL.
*   **`language`**: This crate provides the foundational layer for all language-specific intelligence. It uses the **`tree-sitter`** library to parse code into concrete syntax trees, which enables fast and accurate syntax highlighting, code folding, and structural code navigation.
*   **`lsp`**: This crate is the client-side implementation of the **Language Server Protocol (LSP)**. It is responsible for spawning, managing, and communicating with external language server processes. This is how Zed gets rich language features like diagnostics, code completion, and go-to-definition for a wide variety of languages.
*   **`theme`**: This crate manages all visual styling. It defines the data structures for themes, loads theme files (which are in JSON format), and provides colors and style properties to the `gpui` framework.
*   **`project`**: This is a high-level crate that orchestrates a user's project. It manages a collection of worktrees (directories), integrates with the `LspStore` and `GitStore`, and handles the state for both local and remote (collaborative) projects.
*   **`client`**: This crate is the primary networking layer for the editor. It manages the WebSocket connection to the `collab` server, handles user authentication (including the OAuth flow), and provides the RPC framework that the rest of the application uses to communicate with the backend.
*   **`copilot`**: This crate integrates GitHub Copilot. It manages the lifecycle of the Copilot language server (which is a Node.js application), handles authentication with GitHub, and provides completion suggestions to the editor's inline prediction system.
*   **`db`**: This crate provides a resilient, application-wide interface to a local **SQLite** database. It is used by various features for persistence. It includes a robust migration system and can fall back to an in-memory database if the file on disk is corrupted.

### 4. Extension System (`extensions/`)

Zed has a powerful extension system that allows for adding new languages and tools. Extensions are self-contained packages that are loaded at runtime. My analysis of the `html`, `ruff`, and `snippets` extensions reveals a flexible and consistent architecture:

*   **Manifest (`extension.toml`)**: Every extension has a manifest file that declares its name, version, and, most importantly, the capabilities it provides. This often includes registering a language server for a specific language.
*   **Language Server Integration**: The primary way extensions add functionality is by providing a language server. The extension's Rust code is responsible for locating and running the server's executable. Zed's extension API provides the tools to do this, including:
    *   **NPM Package Management**: For language servers distributed as npm packages (like `vscode-html-language-server`), the API can download and install them automatically.
    *   **Native Binary Management**: For native tools (like `ruff`), the API can download and extract binaries directly from GitHub Releases, intelligently selecting the correct asset for the user's OS and architecture.
*   **Custom Tooling**: The `snippets` extension demonstrates a clever use of this system. Instead of building a snippet engine into Zed's core, they implemented it as a lightweight, custom language server whose only job is to provide snippet completions. This makes the system highly modular and easy to extend.

### 5. Automation and Tooling (`script/`)

The `script/` directory contains a rich set of scripts for automating development, build, and deployment tasks.

*   **`bootstrap`**: This is the entry point for new developers. It automates the setup of the local development environment by installing necessary dependencies like `foreman` (a process manager) and `minio` (an S3-compatible server), and by creating the local PostgreSQL databases required by the `collab` server.
*   **`deploy-collab`**: This script handles deployments of the collaboration server. It does not perform the deployment itself but acts as a trigger for a CI/CD pipeline. It takes an environment (`staging` or `production`) as an argument, creates an appropriate Git tag (e.g., `collab-staging`), and pushes it to the remote repository. This push then triggers a GitHub Action that builds and deploys the server.

### 6. Configuration and Theming (`assets/`)

The `assets/` directory holds all the default configurations, themes, icons, and other resources.

*   **`keymaps/`**: This directory contains the default keybindings. The keymap files are JSON and feature a powerful, context-aware system. A single keybinding can have different effects depending on the UI context (e.g., in the editor vs. in the terminal). This allows for a rich and intuitive user experience.
*   **`settings/`**: The `default.json` file in this directory is the single source of truth for all of Zed's default settings. It is a heavily commented JSON file that exposes a vast number of options for customizing everything from fonts and themes to editor behavior and language-specific settings.
*   **`themes/`**: This directory contains the default color themes that ship with Zed. Themes are defined as simple JSON files.
*   **`prompts/`**: This directory contains Handlebars (`.hbs`) templates for the AI assistant's system prompts. The `assistant_system_prompt.hbs` is particularly insightful, as it reveals that the AI is a sophisticated, tool-using agent that is given strict instructions on how to behave, how to use tools to interact with the user's project, and even how to format its output.

### 7. Conclusion

The Zed codebase is a well-architected, modern software project that showcases a high degree of engineering skill. Key design principles include:

*   **Modularity**: The codebase is broken down into small, single-responsibility crates, which makes it easier to understand, maintain, and contribute to.
*   **Performance**: The custom, GPU-accelerated UI framework and the use of Rust are clear indicators that performance is a top priority.
*   **Extensibility**: The language server-based extension system allows for easily adding new languages and tools without modifying the core editor.
*   **Automation**: The comprehensive set of scripts for bootstrapping, building, and deploying the application streamlines the development process.
*   **Declarative Configuration**: The use of JSON for settings, keymaps, and themes makes the editor highly customizable for users.

Overall, Zed is an impressive project with a solid and scalable architecture. This concludes the analysis.

---
### Crate-Level Analysis: `action_log`

This section provides a detailed, file-by-file analysis of the `action_log` crate.

-   **`crates/action_log`**
    -   **Description**: This crate provides a system for logging user and agent actions performed on buffers. This "action log" is more sophisticated than a simple history, as it tracks the *author* of changes (user vs. agent) and their review state (e.g., unreviewed, accepted, rejected). This is a foundational component for enabling collaborative AI features where the agent modifies code.
    -   **`Cargo.toml`**:
        -   **Purpose**: The crate's manifest file.
        -   **Key Dependencies**:
            -   `project`, `language`, `buffer_diff`: Shows that the crate's primary function is to track changes to code buffers within a project.
            -   `clock`: Indicates that logged actions are timestamped.
            -   `gpui`: It is a `gpui` entity, meaning it's integrated into the core application state.
    -   **`src/action_log.rs`**:
        -   **Purpose**: Contains the core logic for the action logging system. It defines the data structures for tracking buffer states and the history of edits.
        -   **Key Structs**:
            -   `ActionLog`: The main entity that manages a collection of tracked buffers. It serves as the primary interface for logging actions.
            -   `TrackedBuffer`: Holds the detailed state for a single tracked buffer. This includes the `diff_base` (the version of the text against which changes are compared), `unreviewed_edits` (a patch of agent changes not yet approved by the user), and the `status` of the file (`Created`, `Modified`, `Deleted`).
        -   **Key Functions**:
            -   `new(project: Entity<Project>)`: The constructor for the `ActionLog`. **Input**: A `Project` entity. **Output**: A new `ActionLog` instance.
            -   `buffer_read(...)`, `buffer_created(...)`, `buffer_edited(...)`: These are the API methods called by the agent system to notify the log of interactions with a buffer, which initiates or updates the tracking.
            -   `unnotified_user_edits(...)`: Calculates a unified diff of all changes a *user* has made to tracked buffers since the AI was last notified. This is critical for keeping the AI's context up-to-date. **Output**: `Option<String>` containing the unified diff.
            -   `keep_edits_in_range(...)`, `reject_edits_in_ranges(...)`: These methods allow the user to accept or reject specific agent-suggested changes by updating the internal diff state.
---
### Crate-Level Analysis: `activity_indicator`

This section provides a detailed, file-by-file analysis of the `activity_indicator` crate.

-   **`crates/activity_indicator`**
    -   **Description**: This crate provides a reusable UI component, likely a spinner or progress message, that is displayed in the Zed status bar. It gives the user visual feedback about long-running background tasks, such as language server indexing, application auto-updates, or Git operations.
    -   **`Cargo.toml`**:
        -   **Purpose**: The crate's manifest file.
        -   **Key Dependencies**:
            -   `gpui`, `ui`: Confirms this is a UI component built with Zed's `gpui` framework.
            -   `auto_update`, `extension_host`, `project`: Shows that the indicator listens to events from various background systems to know when to display status messages.
    -   **`src/activity_indicator.rs`**:
        -   **Purpose**: Contains the complete implementation of the activity indicator UI component.
        -   **Key Structs**:
            -   `ActivityIndicator`: The main UI component, which is a `StatusItemView` designed to be rendered in the status bar. It aggregates status information from multiple sources.
            -   `ServerStatus`: A simple struct to hold the name and current status of a given language server.
        -   **Key Functions**:
            -   `new(...)`: The constructor for the `ActivityIndicator`. **Logic**: It sets up subscriptions to a wide variety of event sources across the application, including the `LanguageRegistry`, `LspStore`, `GitStore`, and `AutoUpdater`.
            -   `render(...)`: The main `gpui` render function that determines what to display. **Logic**: It implements a priority system to decide which status message is the most important to show at any given time. For example, a critical error from a language server will be shown over a simple "checking for updates" message.
            -   `content_to_render(...)`: A helper function called by `render` that contains the priority logic for selecting the most important status message to display from all available sources. **Output**: An `Option<Content>`, where `Content` is a struct containing the message, icon, and any associated click handler.
---
### Crate-Level Analysis: `agent`

This section provides a detailed, file-by-file analysis of the `agent` crate.

-   **`crates/agent`**
    -   **Description**: This is the central "brain" or "engine" for Zed's AI assistant. It orchestrates the entire agentic loop: receiving a prompt, gathering context, selecting and executing tools, and generating a response. It has extensive dependencies, indicating its role in coordinating many other parts of the system. It also has complex persistence needs, using both SQLite and LMDB for storing conversation history and other agent-related data.
    -   **`Cargo.toml`**:
        -   **Purpose**: The crate's manifest file.
        -   **Key Dependencies**:
            -   `language_model`, `cloud_llm_client`: For direct interaction with language models.
            -   `assistant_tool`, `assistant_context`, `agent_settings`: Consumes the definitions for tools, context, and profiles from other crates.
            -   `project`, `workspace`, `editor`, `git`: Has deep access to the user's workspace state.
            -   `sqlez`, `heed`: Uses two different database backends for persistence.
            -   `action_log`: Depends on the action log to track its own file modifications and stay aware of user edits.
    -   **`src/agent.rs`**:
        -   **Purpose**: The main library entry point for the `agent` crate. It acts as a facade, organizing the crate's functionality into a set of cohesive modules and re-exporting the most important public types.
        -   **Key Modules**: `agent_profile`, `context`, `context_store`, `thread`, `thread_store`, `tool_use`.
        -   **`init` function**: Initializes the `thread_store`, which sets up the necessary databases and global state for persisting conversation threads.
    -   **`src/agent_profile.rs`**:
        -   **Purpose**: Defines and manages "Agent Profiles," which are user-configurable personalities that control an agent's capabilities, primarily by enabling or disabling specific tools.
        -   **`AgentProfile` Struct**: Represents a single active profile, identified by an ID and holding a reference to the master `ToolWorkingSet`.
        -   **Key Functions**:
            -   `enabled_tools()`: The core logic of a profile. It filters the master list of all available tools against the current profile's settings to determine which tools are active for the current conversation. **Output**: A `Vec` of enabled `Tool` trait objects.
    -   **`src/context.rs`**:
        -   **Purpose**: Defines the data structures for the various *types* of context that can be sent to the agent (e.g., files, symbols, selections, images).
        -   **`AgentContext` Enum**: Represents a fully *loaded* piece of context, containing the actual text or image data ready to be formatted for the LLM.
        -   **`load_context` Function**: The main orchestrator for preparing context. **Input**: A `Vec` of lightweight `AgentContextHandle`s. **Logic**: It asynchronously loads the content for each handle and formats it into a single XML-like string and a list of images. **Output**: A `Task` that resolves to the final formatted context.
    -   **`src/context_store.rs`**:
        -   **Purpose**: Provides the `ContextStore`, a stateful manager that holds the set of all context items the user has "attached" to the current conversation.
        -   **`ContextStore` Struct**: The central entity that manages the collection of active context items. Its primary field is a `context_set` which prevents duplicate context items from being added.
        -   **Key Functions**:
            -   `add_file_from_path()`, `add_symbol()`, etc.: The public API used by the UI to add context items to the store.
            -   `new_context_for_thread()`: An important function that gets the list of context items from the store that have not yet been sent to the LLM in the current conversation, preventing redundancy.
    -   **`src/thread.rs`**:
        -   **Purpose**: Defines the `Thread` entity, which is the live, in-memory representation of a single conversation.
        -   **`Thread` Struct**: A large, stateful object that holds the entire history of messages, the state of any tool calls (`ToolUseState`), a reference to the project and action log, and the current agent profile and model.
        -   **Key Functions**:
            -   `send_to_model()`: The main entry point for generating an agent response. It builds the `LanguageModelRequest`, sends it to the model, and streams the response back, handling text, tool calls, and errors.
            -   `to_completion_request()`: Assembles the full history of messages, context, and tool results into the final payload to be sent to the LLM.
    -   **`src/thread_store.rs`**:
        -   **Purpose**: Manages the persistence of conversation threads to a local database.
        -   **`ThreadStore` Struct**: The high-level manager for creating, loading, and deleting threads.
        -   **`ThreadsDatabase` Struct**: An abstraction over a SQLite database that handles the actual saving and loading of serialized `Thread` objects. It also contains logic for migrating from an older database format.
    -   **`src/tool_use.rs`**:
        -   **Purpose**: Provides the `ToolUseState` struct, which is a state machine for managing the entire lifecycle of all tool calls within a thread.
        -   **`ToolUseState` Struct**: Tracks pending tool calls, completed tool results, and rich UI cards for displaying tool output.
        -   **`PendingToolUseStatus` Enum**: A state machine (`Idle`, `NeedsConfirmation`, `Running`, `Error`) for a single in-flight tool call.
    -   **`src/history_store.rs`**:
        -   **Purpose**: Manages the user's agent-related history by combining saved conversation threads and other context items into a single, chronologically sorted list for the UI.
        -   **`HistoryStore` Struct**: The main entity that fetches items from the `ThreadStore` and other context stores to create a unified history.
    -   **`src/context_server_tool.rs`**:
        -   **Purpose**: Defines a generic `Tool` implementation that acts as a proxy for tools provided by an external "context server" (i.e., a third-party extension).
        -   **`ContextServerTool` Struct**: A wrapper that implements the `Tool` trait but delegates the actual execution to an external process via RPC.
        -   **`run` Function**: The core logic that sends a `CallTool` request to the appropriate context server and returns its result.
---
### Crate-Level Analysis: `agent2`

This section provides a detailed, file-by-file analysis of the `agent2` crate.

-   **`crates/agent2`**
    -   **Description**: This crate represents the next-generation, in-process AI agent for Zed. It is a complete redesign of the original `agent` crate, with a strong focus on modularity, structured tool definitions, and highly interactive, real-time communication with the UI. It replaces the complex, monolithic `Thread` object with a more distributed and event-driven architecture. The core design revolves around the `acp_thread` (Agent Client Protocol Thread) for communication and a new `AgentTool` trait for defining capabilities.
    -   **`Cargo.toml`**:
        -   **Purpose**: The crate's manifest file.
        -   **Key Dependencies**:
            -   `agent_client_protocol` (`acp`): This is a critical dependency, defining the standardized protocol for communication between the agent and the client UI.
            -   `language_model`: For direct interaction with LLMs.
            -   `assistant_tool`: Provides the `outline` functionality, showing some reuse from the older agent system.
            -   `project`, `workspace`, `editor`: Has deep access to the user's workspace state to perform actions.
            -   `sqlez`: Used for database interactions, specifically for conversation history.
            -   `schemars`, `serde_json`: Used heavily in the new tool system to generate JSON schemas for tool inputs, which are then provided to the LLM.
    -   **`src/agent2.rs`**:
        -   **Purpose**: The main library entry point for the `agent2` crate. It primarily re-exports the key public types from its various modules, such as `NativeAgent`, `NativeAgentConnection`, `HistoryStore`, and `Templates`, to make them accessible to other parts of the application.
    -   **`src/agent.rs`**:
        -   **Purpose**: Contains the definition of `NativeAgent`, the central orchestrator for the new agent. This is where the main conversational loop and tool-dispatching logic reside.
        -   **`NativeAgent` Struct**: The core state machine for the agent. It holds references to the project, history store, tool definitions, and the active language model client.
        -   **Key Functions**:
            -   `new(...)`: The async constructor that initializes the agent and its tools.
            -   `query(...)`: The main entry point for processing a user's prompt. It constructs the request, sends it to the language model, and then streams the response. It handles both text generation and the new, structured `tool_calls`.
            -   `dispatch_tool_call(...)`: A crucial function that takes a `tool_call` from the LLM, finds the corresponding `AgentTool` implementation, deserializes the input, and executes the tool's `run` method.
    -   **`src/db.rs`**:
        -   **Purpose**: Defines the database schema for storing conversation history using the `sqlez` library.
        -   **`Db` Struct**: A wrapper around a `sqlez::Connection` that provides high-level methods for database operations.
        -   **Key Functions**: `save_thread`, `load_thread`, `load_all_threads`. These functions handle the serialization of conversation state to and from the SQLite database.
    -   **`src/history_store.rs`**:
        -   **Purpose**: Provides the `HistoryStore` entity, which acts as a cache and manager for conversation history. It bridges the gap between the in-memory representation of conversations (`thread.rs`) and the database persistence layer (`db.rs`).
    -   **`src/thread.rs`**:
        -   **Purpose**: Defines the `Thread` struct, which represents a single, live conversation. Unlike the old agent, this `Thread` is more focused on the sequence of messages and tool interactions rather than being a monolithic state object.
        -   **`Thread` Struct**: Holds a `Vec<Message>`, where `Message` is an enum that can be from the user, the assistant, or a tool result.
        -   **`ToolCall` and `ToolResult` Structs**: These are structured representations of tool interactions, making the conversation history much more explicit and machine-readable compared to the previous agent's XML-based approach.
    -   **`src/tools.rs`**:
        -   **Purpose**: Acts as a facade and registry for all the tools available to the `NativeAgent`.
        -   **`Tools` Struct**: Holds an `Arc` for each available tool.
        -   **`new(...)` Function**: The constructor that instantiates every single `AgentTool` implementation (e.g., `ReadFileTool`, `TerminalTool`) and stores them. This is where the agent's full capability set is defined.
        -   **`dispatch(...)` Function**: The central tool dispatch logic. It takes a tool name and its input as raw JSON, looks up the correct tool implementation, and calls its `run` method.
    -   **`src/tools/` (Directory)**:
        -   **Purpose**: Contains the modular, individual implementations of each `AgentTool`. This is a major architectural improvement.
        -   **`AgentTool` Trait**: Each tool implements this trait, which defines a standard interface with methods like `name()`, `kind()`, `run()`, and an associated `Input` type with a `JsonSchema`.
        -   **`read_file_tool.rs`**: An implementation of the `read_file` tool. It handles reading files (including partial reads with line ranges), generating outlines for large files, and checking security settings (`file_scan_exclusions`, `private_files`).
        -   **`terminal_tool.rs`**: An implementation of the `terminal` tool. It executes shell commands, requires user authorization for security, and ensures commands are run within the context of a project worktree.
    -   **`src/native_agent_server.rs`**:
        -   **Purpose**: Implements the `agent_servers::AgentServer` trait for the `NativeAgent`. This is the glue code that allows the main Zed application to discover, create, and communicate with the `agent2` implementation.
        -   **`connect(...)` Function**: The factory method that gets called by the application to start an agent session. It creates the `NativeAgent` instance and wraps it in a `NativeAgentConnection`, which adapts it to the application's generic agent communication protocol (`acp_thread::AgentConnection`).
---
### Crate-Level Analysis: `agent_servers`

This section provides a detailed, file-by-file analysis of the `agent_servers` crate.

-   **`crates/agent_servers`**
    -   **Description**: This crate provides a pluggable framework for managing and connecting to different AI agent backends. It defines a common interface (`AgentServer` trait) that abstracts away the details of how an agent is run and communicated with. This allows Zed to seamlessly support built-in agents (like `agent2`), third-party CLI tools (like Claude), and custom user-defined agents.
    -   **`Cargo.toml`**:
        -   **Purpose**: The crate's manifest file.
        -   **Key Dependencies**:
            -   `acp_thread`, `agent-client-protocol`: Shows its deep integration with the Agent Client Protocol for communication.
            -   `context_server`: Indicates it can interact with the extension system's tool-providing servers.
            -   `reqwest_client`: Optional dependency for making HTTP requests, likely for API-based agents.
    -   **`src/agent_servers.rs`**:
        -   **Purpose**: The main library entry point. It defines the central `AgentServer` trait and provides helper utilities for managing external agent processes.
        -   **`AgentServer` Trait**: The core abstraction. It defines the contract for any agent provider, requiring methods for UI metadata (`name`, `logo`) and, most importantly, a `connect` method that returns a live `AgentConnection`.
        -   **`AgentServerCommand` Struct**: A helper for defining and finding executables for command-line based agents, with a robust resolution strategy (settings -> PATH -> fallback).
    -   **`src/claude.rs`**:
        -   **Purpose**: A concrete `AgentServer` implementation for the external `@anthropic-ai/claude-code` CLI tool.
        -   **Logic**: It demonstrates the full lifecycle: spawning the `claude` process, communicating with it over `stdio` using a streaming JSON protocol, and translating its custom protocol into the standard `AcpThread` events that the Zed UI understands.
    -   **`src/claude/tools.rs`**:
        -   **Purpose**: Defines the mapping from the Claude agent's specific tool-use format into Zed's internal, standardized `acp::ToolCall` representation. It acts as a translation layer.
    -   **`src/claude/mcp_server.rs`**:
        -   **Purpose**: Implements the local proxy server that securely exposes Zed's functionality to the external Claude agent process. This is the key to the entire integration.
        -   **`ClaudeZedMcpServer` Struct**: Wraps a generic `context_server::listener::McpServer`, showing that this functionality is built on a reusable framework.
        -   **Key Functions**:
            -   `new(...)`: The constructor. It creates the server and, most importantly, registers the tool handlers (`PermissionTool`, `ReadTool`, `EditTool`, `WriteTool`) that contain the actual logic for performing actions.
            -   `server_config()`: Constructs the configuration for the Claude CLI. It tells the CLI how to connect back to this server: by spawning the main Zed executable with special arguments (`--nc <socket_path>`) to make a tool call. This isolates tool execution in a separate process.
            -   `handle_initialize()`: A standard LSP-style handler that advertises the server's `ToolsCapabilities` to the client.
    -   **`src/custom.rs`**:
        -   **Purpose**: A generic `AgentServer` implementation for user-defined agents.
        -   **Logic**: It's a lightweight wrapper that takes a name and a command from user settings and uses a generic helper function (`crate::acp::connect`) to handle the process spawning and communication. This makes the system highly extensible.
    -   **`src/settings.rs`**:
        -   **Purpose**: Defines the data structures for configuring all agent servers in `settings.json`.
        -   **`AllAgentServersSettings` Struct**: The top-level settings object. It has dedicated fields for `claude` and `gemini` and uses `#[serde(flatten)]` on a `HashMap` to allow users to define an arbitrary number of custom agents with a clean JSON structure.
