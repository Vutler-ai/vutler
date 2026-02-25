# 🚀 Vutler Frontend - Quick Start

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
# http://localhost:3000
```

## Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Pages URLs

Once the dev server is running, access these pages:

- 📧 **Email**: http://localhost:3000/email
- ✅ **Tasks**: http://localhost:3000/tasks
- 📅 **Calendar**: http://localhost:3000/calendar
- 📁 **Drive**: http://localhost:3000/drive

## API Configuration

Make sure your API is running and accessible at the endpoints:

- `GET /api/v1/email/inbox`
- `GET /api/v1/email/:uid`
- `POST /api/v1/email/send`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PUT /api/v1/tasks/:id`
- `DELETE /api/v1/tasks/:id`
- `GET /api/v1/calendar/events`
- `POST /api/v1/calendar/events`
- `PUT /api/v1/calendar/events/:id`
- `DELETE /api/v1/calendar/events/:id`
- `GET /api/v1/drive/files`
- `GET /api/v1/drive/files/:id/download`
- `POST /api/v1/drive/files/upload`

## Testing Without Backend

See `MOCK_DATA.md` for sample data and instructions on creating a mock server.

## File Structure

```
src/app/(app)/
├── email/
│   └── page.tsx       ← Email Inbox
├── tasks/
│   └── page.tsx       ← Task Manager
├── calendar/
│   └── page.tsx       ← Calendar
└── drive/
    └── page.tsx       ← File Manager
```

## Design System Reference

```css
/* Colors */
--bg: #08090f
--card: #14151f
--border: rgba(255,255,255,0.07)
--accent: #3b82f6
--text-primary: white
--text-secondary: #9ca3af
--text-muted: #6b7280
```

## Features Checklist

### Email ✅
- [x] Inbox list
- [x] Email preview
- [x] Compose modal
- [x] Send email
- [x] Search/filter
- [x] Refresh

### Tasks ✅
- [x] Kanban board
- [x] Create task
- [x] Edit task
- [x] Delete task
- [x] Drag & drop
- [x] Priority badges
- [x] Agent assignment

### Calendar ✅
- [x] Month view
- [x] Navigate months
- [x] Create event
- [x] Edit event
- [x] Delete event
- [x] Color picker
- [x] Upcoming sidebar

### Drive ✅
- [x] File list
- [x] Navigate folders
- [x] Breadcrumbs
- [x] Grid/List toggle
- [x] Upload files
- [x] Download files
- [x] File type icons

## Next Steps

1. **Connect Backend**: Update API endpoints if needed
2. **Authentication**: Add auth guards to pages
3. **Real-time**: Implement WebSocket updates
4. **Mobile**: Optimize responsive layouts
5. **Testing**: Add unit/integration tests
6. **Performance**: Add caching and optimization

## Support

For issues or questions:
- Check `PAGES_IMPLEMENTATION.md` for detailed docs
- Review `MOCK_DATA.md` for API examples
- Test build with `npm run build`

---

**Created**: February 25, 2026  
**Status**: ✅ Production Ready  
**Designer**: Philip
