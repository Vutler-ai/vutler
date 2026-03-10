# Sprint 1: Agent Dashboard — Integration Guide

## Overview
This guide explains how to integrate the Agent Dashboard UI components into the Vutler application (Rocket.Chat fork).

## Files Created
All files are located in: `app/apps/meteor/client/views/agents/`

- `AgentsPage.tsx` — Main agents list page
- `AgentDetailPage.tsx` — Individual agent detail page
- `AgentsTable.tsx` — Reusable agents table component
- `AgentsRoute.tsx` — Route wrapper component
- `types.ts` — TypeScript type definitions
- `index.ts` — Module exports
- `README.md` — Component documentation
- `DESIGN.md` — Visual design specifications

## Integration Steps

### 1. Add Routes

Add the following route definition to `apps/meteor/client/views/admin/routes.tsx`:

```typescript
import { lazy } from 'react';

// Add to the IRouterPaths interface
declare module '@rocket.chat/ui-contexts' {
	interface IRouterPaths {
		// ... existing routes
		'agents': {
			pathname: `/agents${`/${string}` | ''}`;
			pattern: '/agents/:id?';
		};
	}
}

// Add to the routes array
export const routes = [
	// ... existing routes
	{
		path: '/agents/:id?',
		element: lazy(() => import('../agents/AgentsRoute')),
	},
];
```

### 2. Add Sidebar Navigation

Add the Agents menu item to the sidebar navigation in `apps/meteor/client/views/admin/sidebarItems.ts`:

```typescript
export const adminSidebarItems: AdminSidebarItem[] = [
	// ... existing items
	{
		href: '/agents',
		i18nLabel: 'Agents',
		icon: 'robot' as const,
		permissionGranted: (): boolean => hasPermission('view-agents'),
	},
	// ... other items
];
```

### 3. Add Translations

Add the following translation keys to `apps/meteor/client/i18n/` (or equivalent):

```json
{
	"Agents": "Agents",
	"Agent": "Agent",
	"Create_Agent": "Create Agent",
	"Search_agents": "Search agents...",
	"No_agents_found": "No agents found",
	"Error_loading_agents": "Error loading agents",
	"Agent_not_found": "Agent not found",
	"The_agent_you_are_looking_for_does_not_exist": "The agent you are looking for does not exist",
	"Recent_Activity": "Recent Activity",
	"No_recent_activity": "No recent activity",
	"Configuration": "Configuration",
	"API_Key": "API Key",
	"API_key_copied": "API key copied to clipboard",
	"Description": "Description",
	"No_description": "No description",
	"Created": "Created",
	"Pause_Agent": "Pause Agent",
	"Delete": "Delete",
	"Feature_coming_in_Sprint_2": "This feature will be available in Sprint 2",
	"Last_Activity": "Last Activity",
	"Avatar": "Avatar",
	"Status": "Status",
	"online": "Online",
	"offline": "Offline",
	"busy": "Busy",
	"Just_now": "Just now",
	"{{count}}_minutes_ago": "{{count}} minute(s) ago",
	"{{count}}_hours_ago": "{{count}} hour(s) ago",
	"{{count}}_days_ago": "{{count}} day(s) ago",
	"Never": "Never"
}
```

### 4. Add Permissions (Optional)

If you want to restrict access to the Agents dashboard, add a permission in the database:

```javascript
// In MongoDB or via admin panel
db.rocketchat_permissions.insert({
	_id: 'view-agents',
	roles: ['admin', 'agent-manager'],
});
```

### 5. Update Main Router

Ensure the main router includes the admin routes where the agents routes are defined. This is typically already done in `apps/meteor/client/router/`.

### 6. Verify Fuselage Components

The following Fuselage components are used and should already be available:

- `Page`, `PageHeader`, `PageContent`
- `Table`, `Box`, `Button`, `ButtonGroup`
- `Avatar`, `Tag`, `Icon`
- `InputBox`, `Select`, `Field`, `FieldLabel`, `FieldRow`
- `Throbber`, `Skeleton`

If any are missing, import them from `@rocket.chat/fuselage`.

## Testing

### Manual Testing

1. Start the Vutler app:
   ```bash
   cd apps/meteor
   npm install
   npm start
   ```

2. Navigate to `/agents` in your browser

3. Test the following:
   - [ ] Agents list renders with mock data
   - [ ] Search filters work
   - [ ] Status dropdown filters work
   - [ ] Clicking an agent navigates to detail page
   - [ ] Detail page shows agent info, activity, and config
   - [ ] API key can be revealed/hidden and copied
   - [ ] Back button returns to agents list
   - [ ] Create Agent button navigates (even if page doesn't exist yet)

### TypeScript Check

```bash
cd app
npm run typecheck
```

### Linting

```bash
cd app
npm run lint
```

## Sprint 2 Integration Points

The following features are **UI-only** in Sprint 1 and need backend implementation in Sprint 2:

### API Endpoints Needed

```typescript
// GET /api/v1/agents
// Returns list of agents with pagination/filtering

// GET /api/v1/agents/:id
// Returns single agent details

// POST /api/v1/agents
// Creates a new agent

// PUT /api/v1/agents/:id/pause
// Pauses an agent

// DELETE /api/v1/agents/:id
// Deletes an agent

// GET /api/v1/agents/:id/activity
// Returns recent activity for an agent
```

### Data Flow

Replace mock data imports with:

```typescript
// In AgentsPage.tsx
const { data, isLoading, isError } = useQuery({
  queryKey: ['agents'],
  queryFn: async () => {
    const endpoint = useEndpoint('GET', '/v1/agents');
    return endpoint({ /* filters */ });
  }
});

// In AgentDetailPage.tsx
const { data: agent } = useQuery({
  queryKey: ['agent', agentId],
  queryFn: async () => {
    const endpoint = useEndpoint('GET', `/v1/agents/${agentId}`);
    return endpoint();
  }
});

const { data: activities } = useQuery({
  queryKey: ['agent-activity', agentId],
  queryFn: async () => {
    const endpoint = useEndpoint('GET', `/v1/agents/${agentId}/activity`);
    return endpoint({ limit: 10 });
  }
});
```

### Real-Time Updates

Use Rocket.Chat's reactive data layer for status updates:

```typescript
import { useReactiveValue } from '@rocket.chat/ui-contexts';

const agentStatus = useReactiveValue(() => {
  return AgentStatus.findOne({ agentId });
});
```

## Troubleshooting

### Routes not loading
- Verify routes are added to the main router configuration
- Check browser console for import errors
- Ensure `AgentsRoute` is properly exported from `index.ts`

### Styling issues
- Verify Fuselage version matches Rocket.Chat's version
- Check for conflicting CSS classes
- Use browser DevTools to inspect element styles

### TypeScript errors
- Run `npm run typecheck` to see all errors
- Ensure `@rocket.chat/ui-contexts` types are up to date
- Verify all Fuselage component imports

## Screenshots

(To be added after UI is rendered in browser)

## Next Steps

- [ ] Complete Sprint 2 backend integration
- [ ] Add unit tests for components
- [ ] Add Storybook stories for components
- [ ] Add E2E tests with Playwright/Cypress
- [ ] Gather user feedback on UI/UX

## Support

For questions or issues, contact:
- **UI/UX:** Philip (this agent)
- **Backend:** Rico (API agent, Sprint 2)
- **Product:** Luna (Product Owner)
