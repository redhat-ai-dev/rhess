## ADDED Requirements

### Requirement: Browsable skill directory — no login required

The server SHALL serve a React web UI at the root path (`/`) that displays all indexed skills in a searchable, paginated list. The UI SHALL be served by the same Fastify process. No authentication SHALL be required to browse, search, or view skills.

#### Scenario: Unauthenticated browser visit

- **WHEN** a user navigates to the server root in a browser
- **THEN** the UI loads and displays a list of indexed skills without prompting for login

#### Scenario: Static asset serving

- **WHEN** the browser requests React build assets (JS, CSS, fonts)
- **THEN** Fastify serves them from the embedded static asset directory

### Requirement: Skill list with metadata and install command

The skill list SHALL display for each skill: name, description, source repository identifier, and a one-line install command (`npx skills add <server-url> --skill <source>/<slug>`). The install command SHALL be copyable to clipboard.

#### Scenario: Skill list entry

- **WHEN** the skills list is displayed
- **THEN** each entry shows the skill name, a truncated description, the source slug, and a copy-to-clipboard install command

#### Scenario: Copy install command

- **WHEN** a user clicks the copy icon for a skill
- **THEN** the install command string is written to the clipboard

### Requirement: Real-time search

The UI SHALL include a search bar that queries `GET /api/v1/skills/search?q=<query>` as the user types and updates the displayed list in real time. Search results SHALL be shown in relevance order.

#### Scenario: Live search

- **WHEN** a user types in the search bar
- **THEN** the skill list updates to show matching results within 300ms of the last keystroke (debounced)

#### Scenario: Clear search

- **WHEN** a user clears the search bar
- **THEN** the full paginated skill list is restored

### Requirement: Skill detail page

The UI SHALL provide a detail page for each skill (e.g., `/<source>/<slug>`) that renders the SKILL.md content as formatted HTML, displays parsed frontmatter metadata (name, description, `allowed-tools` if present), and shows the install command. SKILL.md SHALL be rendered client-side using `react-markdown`.

#### Scenario: SKILL.md rendering

- **WHEN** a user navigates to a skill detail page
- **THEN** the SKILL.md content is fetched from the API and rendered as formatted HTML

#### Scenario: Frontmatter metadata display

- **WHEN** a skill has `allowed-tools` in its frontmatter
- **THEN** the detail page displays the allowed tools list alongside name and description

### Requirement: PatternFly design system

The web UI SHALL be built using PatternFly (Red Hat's design system) with React and Vite. All UI components — tables, toolbars, search inputs, modals, forms — SHALL use PatternFly components.

#### Scenario: Visual consistency

- **WHEN** the web UI is rendered
- **THEN** it uses PatternFly component styles consistent with RHDH and the OpenShift console

### Requirement: Admin management UI

The UI SHALL include an admin section for managing skill sources (add source, trigger sync, delete source). The admin section SHALL be gated — it SHALL prompt for the admin token before performing write operations. Read views (skill list, detail pages) SHALL remain accessible without the admin token.

#### Scenario: Admin token prompt

- **WHEN** an admin attempts to add a source or trigger a sync from the UI
- **THEN** the UI prompts for the admin token if one is not already stored in the session
- **THEN** the token is used as the `Authorization: Bearer` header in the API call

#### Scenario: Non-admin user sees no admin controls

- **WHEN** a user has not entered an admin token
- **THEN** the add-source form and sync/delete buttons are hidden or disabled
