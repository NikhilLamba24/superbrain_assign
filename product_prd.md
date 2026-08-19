# StorySync — Collaborative AI Storyboard

## 1. Objective

Build a small, polished web application called **StorySync**.

StorySync is a collaborative AI storyboard where two users can enter the same project, see each other's live editing presence, work on different scenes, generate image variations using Together AI, and maintain per-user version history for each scene.

The goal is to demonstrate a complete collaborative product loop rather than build a full image editor.

The application must be deployable on Vercel.

Prioritize correctness, simplicity, reliability, and a polished user experience over feature breadth.

---

## 2. Core User Flow

### Step 1 — Username

When a user opens the application, show:

> Choose your username

The user does not create an account and there is no password/authentication system.

Example:

`whiterabbit`

When submitted, check whether that username is currently active.

If the username is already active, show:

> `whiterabbit` is already editing. Please choose another username.

Allow the user to enter another username.

Example:

`blackhorse`

The backend should treat active usernames as temporary editing sessions rather than permanent accounts.

Use a heartbeat mechanism so inactive sessions automatically expire.

---

## 3. Project Selection

After choosing an available username, show a project selection screen.

For the MVP, projects are seeded in the database.

Seed these projects:

* `project_deepsea`
* `project_blueocean`

Do not implement project creation in the MVP.

Each project should display:

* project name
* number of scenes
* currently active collaborators if available
* Enter button

---

## 4. Project Workspace

After entering a project, show the collaborative storyboard workspace.

The workspace should contain:

### Header

* StorySync logo/name
* current project name
* number of active collaborators

### Collaborator presence

Show active users in the current project.

Example:

```text
🟢 whiterabbit — editing Scene 1
🔵 blackhorse — editing Scene 2
```

The presence information must update in real time.

If a user changes scenes, all collaborators should eventually see the updated scene.

If a user disconnects or their heartbeat expires, they should disappear from the active collaborator list.

---

## 5. Scenes

Each project contains multiple seeded scenes.

For example:

```text
Scene 1 — Arrival
Scene 2 — Discovery
Scene 3 — Conflict
Scene 4 — Escape
```

Show scenes in a left-side panel.

Clicking a scene makes it the user's current editing scene.

When the user changes scenes, update their active session with the new scene ID.

---

## 6. Collaborative Editing Model

Do NOT implement simultaneous pixel-level editing.

The MVP is collaborative at the **project and scene level**.

Example:

```text
whiterabbit → Scene 1
blackhorse → Scene 2
```

Both users can independently work on their scenes.

If two users select the same scene, show a non-blocking warning such as:

> `whiterabbit is also editing this scene.`

Do not implement CRDTs or complex conflict resolution.

Use immutable image versions instead.

---

## 7. Scene Workspace

The center of the UI should show the currently selected scene.

Display:

* scene title
* current image
* current version
* prompt used to generate the image
* creator of the current version

Below the image, provide a prompt input.

Example:

```text
Describe the next variation...

[ Generate variation ]
```

---

## 8. Image Generation

Use Together AI as the server-side image generation provider.

Use the available FLUX image generation capability.

Never expose the Together API key in browser/client-side code.

The browser must call our server-side API.

Flow:

```text
Browser
   ↓
Next.js API route
   ↓
Together AI
   ↓
Generated image
   ↓
Supabase Storage
   ↓
Database image version
   ↓
Realtime update
   ↓
All connected clients
```

Handle loading and failure states gracefully.

While an image is generating, show:

> Generating...

and prevent accidental duplicate submissions from the same user.

---

## 9. Image Versioning

Every successful image generation must create an immutable image version.

Each version should contain:

* unique version ID
* scene ID
* creator username
* per-user version number
* image URL
* prompt
* creation timestamp

The UI should display versions in the format:

```text
blackhorse_v1
blackhorse_v2
blackhorse_v3

whiterabbit_v1
whiterabbit_v2
```

The backend should use globally unique IDs internally.

For example:

```text
version UUID: 8c2...
created_by: blackhorse
user_version_number: 3
```

The UI can display:

`blackhorse_v3`.

Do not overwrite previous images.

---

## 10. Version History

Add a lightweight version-history panel for the selected scene.

Example:

```text
VERSION HISTORY

blackhorse_v3
"More cinematic lighting"
12:41 PM

blackhorse_v2
"Add ancient ruins"
12:37 PM

whiterabbit_v2
"Make the scene darker"
12:20 PM
```

Clicking a previous version should allow the user to view that image.

Do not implement complex branching/version merging.

---

## 11. Realtime Behaviour

Use Supabase Realtime or an equally simple managed realtime mechanism.

Do not build custom WebSocket infrastructure.

At minimum support these realtime events:

### Presence update

When a user:

* joins a project
* changes scene
* leaves
* becomes inactive

other users should receive the updated presence.

### Scene/image update

When a user successfully generates a new image:

* create the database version
* update the scene's current version
* broadcast the change
* update other connected clients

### Generation activity

Optionally broadcast:

```text
blackhorse is generating an image for Scene 2...
```

This is desirable if it can be implemented without significant complexity.

---

## 12. Session Management

Use a temporary active-session table.

Suggested fields:

```text
id
username
project_id
scene_id
last_seen_at
created_at
```

When a user joins, check whether an active session exists for the username.

Treat a session as active if:

```text
last_seen_at > current_time - 30 seconds
```

The client should send a heartbeat approximately every 10 seconds.

When a user closes the application, attempt to remove the session, but do not rely on browser unload events for correctness.

The heartbeat expiration mechanism must be the source of truth.

---

## 13. Database

Use Supabase PostgreSQL.

Suggested tables:

### users

```text
id
username
created_at
```

This represents lightweight usernames, not authenticated accounts.

### projects

```text
id
name
created_at
updated_at
```

### scenes

```text
id
project_id
title
description
position
current_version_id
created_at
updated_at
```

### image_versions

```text
id
scene_id
created_by
version_number
image_url
prompt
created_at
```

### active_sessions

```text
id
username
project_id
scene_id
last_seen_at
created_at
```

Use foreign keys where appropriate.

Add indexes for:

* active username lookup
* project session lookup
* scene versions
* project scenes

---

## 14. Suggested API Routes

Implement server-side routes approximately like:

```text
POST /api/sessions/join
POST /api/sessions/heartbeat
POST /api/sessions/leave

GET /api/projects
GET /api/projects/[id]

GET /api/projects/[id]/scenes
GET /api/scenes/[id]

POST /api/scenes/[id]/generate
GET /api/scenes/[id]/versions
```

Do not over-engineer the API layer.

Keep route responsibilities clear.

---

## 15. Join Session API

Example request:

```json
{
  "username": "blackhorse",
  "projectId": "project_blueocean",
  "sceneId": "scene_2"
}
```

The backend should:

1. Validate username.
2. Check active username collision.
3. Create the active session.
4. Return the session ID.
5. Return currently active collaborators in the project.

Example response:

```json
{
  "success": true,
  "sessionId": "...",
  "collaborators": [
    {
      "username": "whiterabbit",
      "sceneId": "scene_1",
      "sceneName": "Arrival"
    }
  ]
}
```

---

## 16. Generate Image API

Example:

```text
POST /api/scenes/[sceneId]/generate
```

Request:

```json
{
  "username": "blackhorse",
  "prompt": "A diver discovers an ancient underwater city..."
}
```

Server flow:

1. Validate the user's active session.
2. Confirm the session belongs to the selected scene/project.
3. Generate the image using Together AI.
4. Upload the resulting image to Supabase Storage.
5. Calculate the user's next version number for the scene.
6. Insert an image_versions record.
7. Update the scene's current_version_id.
8. Trigger the realtime update.
9. Return the generated version information.

Response:

```json
{
  "versionId": "...",
  "displayVersion": "blackhorse_v3",
  "imageUrl": "...",
  "createdBy": "blackhorse"
}
```

---

## 17. UI Design

The UI should feel like a lightweight creative collaboration tool.

Avoid making it look like a generic admin dashboard.

Suggested layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ StorySync     project_blueocean      ● 2 collaborators        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ 🟢 whiterabbit — Scene 1       🔵 blackhorse — Scene 2        │
│                                                               │
├──────────────┬───────────────────────────────┬────────────────┤
│              │                               │                │
│ SCENES       │          IMAGE                │ VERSIONS       │
│              │                               │                │
│ Scene 1      │       ┌─────────────┐         │ blackhorse_v3  │
│ Scene 2  ←   │       │             │         │ blackhorse_v2  │
│ Scene 3      │       │    IMAGE    │         │ whiterabbit_v2 │
│ Scene 4      │       │             │         │                │
│              │       └─────────────┘         │                │
│              │                               │                │
│              │ Scene 2 — Discovery           │                │
│              │                               │                │
├──────────────┴───────────────────────────────┴────────────────┤
│                                                               │
│ Prompt                                                        │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ A diver discovers an ancient underwater city...           │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│                       [ Generate variation ]                   │
└───────────────────────────────────────────────────────────────┘
```

Make the layout responsive enough for desktop use.

The primary target is desktop Chrome.

---

## 18. Seed Data

Create realistic demo data so the application does not start empty.

Project:

```text
project_deepsea
```

Scenes:

```text
Arrival
Descent
Discovery
Ancient City
Escape
```

Project:

```text
project_blueocean
```

Scenes:

```text
Opening
Discovery
Conflict
Revelation
Finale
```

Seed at least one initial image/version for each project or provide visually coherent placeholder images so the application immediately looks populated.

---

## 19. Error Handling

Handle:

* username already active
* Together AI failure
* image generation timeout
* database failure
* realtime connection loss
* expired session
* missing scene
* invalid project
* duplicate generation clicks

Errors should be presented as useful UI messages rather than raw stack traces.

Example:

> Image generation failed. Please try again.

---

## 20. Security

Keep all API secrets server-side.

Do not expose:

* Together API key
* Supabase service role key

to the browser.

The client may use the public Supabase client configuration where appropriate.

Server-only operations must use server-side credentials.

---

## 21. Scope Constraints

This is an MVP prototype.

DO NOT implement:

* user authentication
* passwords
* OAuth
* project creation
* project deletion
* chat
* comments
* payments
* image drawing tools
* Photoshop-like editing
* CRDT
* complex conflict resolution
* multiple AI model providers
* multi-agent architecture
* autonomous agents
* mobile application
* custom WebSocket server
* complicated permissions

The priority is to make the core collaborative workflow work reliably.

---

## 22. Definition of Done

The project is considered complete when the following demo works:

### Browser A

1. Open StorySync.
2. Enter `whiterabbit`.
3. Enter `project_blueocean`.
4. Select Scene 1.

### Browser B

1. Open StorySync in another Chrome profile.
2. Enter `whiterabbit`.
3. Receive the message that `whiterabbit` is already active.
4. Change username to `blackhorse`.
5. Enter `project_blueocean`.
6. Select Scene 2.

### Browser A

Shows:

```text
🟢 whiterabbit — Scene 1
🔵 blackhorse — Scene 2
```

### Browser B

Shows the same presence information.

### Browser B

1. Enter an image prompt.
2. Generate an image.
3. Together AI generates the image.
4. Image is persisted.
5. `blackhorse_v1` is created.
6. Both browsers receive the scene update.

### Browser B

Generate another image.

The UI now shows:

```text
blackhorse_v2
blackhorse_v1
```

The previous image remains available.

### Browser A

Moves to another scene.

Browser B receives the updated presence information.

This complete workflow is the primary success criterion.

---

## 23. Implementation Priority

Build in this order:

1. Next.js application shell.
2. Supabase database/schema.
3. Seed projects/scenes.
4. Username/session handling.
5. Project selection.
6. Workspace UI.
7. Scene selection.
8. Presence/heartbeat.
9. Together AI integration.
10. Image persistence.
11. Image versioning.
12. Realtime scene updates.
13. Version history.
14. Error/loading states.
15. Visual polish.
16. Vercel deployment.
17. Test the complete two-browser flow.

Do not start with visual polish or advanced features.

The two-browser collaboration flow must work first.

---

## 24. Engineering Principle

Prefer the simplest implementation that satisfies the product requirements.

Do not introduce additional infrastructure unless it solves an actual MVP requirement.

The final product should feel like a polished prototype that a reviewer can understand and test within a few minutes.
