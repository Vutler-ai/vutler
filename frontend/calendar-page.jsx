'use client';

import { useState, useEffect, useMemo } from 'react';

// ==================== UTILS ====================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const EVENT_TYPE_COLORS = {
  meeting: '#6366f1',    // indigo
  deadline: '#ef4444',   // red
  reminder: '#f59e0b',   // amber
  sprint: '#10b981'      // green
};

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' }
];

const REMINDER_OPTIONS = [
  { value: 15, label: '15 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' }
];

// Date utilities
const formatDate = (date) => date.toISOString().split('T')[0];
const formatTime = (date) => date.toTimeString().slice(0, 5);
const formatDateTime = (date) => date.toISOString().slice(0, 16);

const getMonthDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay(); // 0 = Sunday
  
  const days = [];
  // Pad beginning
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  // Add month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};

const getWeekDays = (date) => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(date);
  monday.setDate(diff);
  
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const isSameDay = (d1, d2) => {
  return d1.getDate() === d2.getDate() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getFullYear() === d2.getFullYear();
};

const getTimeSlots = () => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
  }
  return slots;
};

// ==================== API CLIENT ====================

const fetchEvents = async (start, end) => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  
  const params = new URLSearchParams();
  if (start) params.append('start', formatDate(start));
  if (end) params.append('end', formatDate(end));
  
  const res = await fetch(`${API_BASE}/calendar/events?${params}`, {
    headers: {
      'X-Auth-Token': token,
      'X-User-Id': userId
    }
  });
  
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
};

const createEvent = async (eventData) => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  
  const res = await fetch(`${API_BASE}/calendar/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
      'X-User-Id': userId
    },
    body: JSON.stringify(eventData)
  });
  
  if (!res.ok) throw new Error('Failed to create event');
  return res.json();
};

const updateEvent = async (id, eventData) => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  
  const res = await fetch(`${API_BASE}/calendar/events/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
      'X-User-Id': userId
    },
    body: JSON.stringify(eventData)
  });
  
  if (!res.ok) throw new Error('Failed to update event');
  return res.json();
};

const deleteEvent = async (id) => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  
  const res = await fetch(`${API_BASE}/calendar/events/${id}`, {
    method: 'DELETE',
    headers: {
      'X-Auth-Token': token,
      'X-User-Id': userId
    }
  });
  
  if (!res.ok) throw new Error('Failed to delete event');
};

const rsvpEvent = async (eventId, status) => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  
  const res = await fetch(`${API_BASE}/calendar/events/${eventId}/rsvp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
      'X-User-Id': userId
    },
    body: JSON.stringify({ status })
  });
  
  if (!res.ok) throw new Error('Failed to RSVP');
  return res.json();
};

// ==================== MAIN COMPONENT ====================

export default function CalendarPage() {
  const [view, setView] = useState('month'); // 'month' | 'week' | 'day'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [agents, setAgents] = useState([]);

  // Load events when date or view changes
  useEffect(() => {
    loadEvents();
  }, [currentDate, view]);

  // Load available agents for attendee selection
  useEffect(() => {
    loadAgents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      let start, end;
      
      if (view === 'month') {
        start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      } else if (view === 'week') {
        const weekDays = getWeekDays(currentDate);
        start = weekDays[0];
        end = weekDays[6];
      } else {
        start = new Date(currentDate);
        end = new Date(currentDate);
      }
      
      const data = await fetchEvents(start, end);
      setEvents(data.map(e => ({
        ...e,
        start_time: new Date(e.start_time),
        end_time: e.end_time ? new Date(e.end_time) : null
      })));
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id');
      
      const res = await fetch(`${API_BASE}/agents`, {
        headers: {
          'X-Auth-Token': token,
          'X-User-Id': userId
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  };

  const handlePrev = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() - 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() - 1);
      setCurrentDate(newDate);
    }
  };

  const handleNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() + 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() + 1);
      setCurrentDate(newDate);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date) => {
    setSelectedDate(date);
    setShowCreateModal(true);
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setShowDetailModal(true);
  };

  const handleCreateEvent = async (eventData) => {
    try {
      await createEvent(eventData);
      setShowCreateModal(false);
      loadEvents();
    } catch (err) {
      console.error('Failed to create event:', err);
      alert('Failed to create event');
    }
  };

  const handleUpdateEvent = async (id, eventData) => {
    try {
      await updateEvent(id, eventData);
      setShowCreateModal(false);
      setShowDetailModal(false);
      loadEvents();
    } catch (err) {
      console.error('Failed to update event:', err);
      alert('Failed to update event');
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!confirm('Delete this event?')) return;
    try {
      await deleteEvent(id);
      setShowDetailModal(false);
      loadEvents();
    } catch (err) {
      console.error('Failed to delete event:', err);
      alert('Failed to delete event');
    }
  };

  const handleRSVP = async (eventId, status) => {
    try {
      await rsvpEvent(eventId, status);
      loadEvents();
      setShowDetailModal(false);
    } catch (err) {
      console.error('Failed to RSVP:', err);
      alert('Failed to RSVP');
    }
  };

  const currentTitle = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      return `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }, [view, currentDate]);

  return (
    <div style={styles.container}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', sans-serif; }
      `}</style>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button onClick={handlePrev} style={styles.navButton}>‹</button>
          <button onClick={handleNext} style={styles.navButton}>›</button>
          <button onClick={handleToday} style={styles.todayButton}>Today</button>
          <h2 style={styles.title}>{currentTitle}</h2>
        </div>
        
        <div style={styles.toolbarRight}>
          <div style={styles.viewSwitcher}>
            <button
              onClick={() => setView('month')}
              style={{...styles.viewButton, ...(view === 'month' ? styles.viewButtonActive : {})}}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              style={{...styles.viewButton, ...(view === 'week' ? styles.viewButtonActive : {})}}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              style={{...styles.viewButton, ...(view === 'day' ? styles.viewButtonActive : {})}}
            >
              Day
            </button>
          </div>
          
          <button
            onClick={() => {
              setSelectedDate(new Date());
              setSelectedEvent(null);
              setShowCreateModal(true);
            }}
            style={styles.createButton}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.content}>
        <div style={styles.mainPanel}>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : (
            <>
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={events}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                />
              )}
              {view === 'week' && (
                <WeekView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={handleEventClick}
                />
              )}
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={handleEventClick}
                />
              )}
            </>
          )}
        </div>

        {/* Mini Calendar Sidebar */}
        <MiniCalendar
          currentDate={currentDate}
          onDateSelect={(date) => {
            setCurrentDate(date);
            setView('day');
          }}
        />
      </div>

      {/* Modals */}
      {showCreateModal && (
        <EventModal
          event={selectedEvent}
          initialDate={selectedDate}
          agents={agents}
          onSave={selectedEvent ? (data) => handleUpdateEvent(selectedEvent.id, data) : handleCreateEvent}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedEvent(null);
          }}
        />
      )}

      {showDetailModal && selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onEdit={() => {
            setShowDetailModal(false);
            setShowCreateModal(true);
          }}
          onDelete={() => handleDeleteEvent(selectedEvent.id)}
          onRSVP={handleRSVP}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
}

// ==================== MONTH VIEW ====================

function MonthView({ currentDate, events, onDayClick, onEventClick }) {
  const days = useMemo(() => getMonthDays(currentDate.getFullYear(), currentDate.getMonth()), [currentDate]);
  
  const getEventsForDay = (date) => {
    if (!date) return [];
    return events.filter(e => {
      if (e.all_day) {
        return isSameDay(e.start_time, date);
      }
      return isSameDay(e.start_time, date);
    });
  };

  return (
    <div style={styles.monthView}>
      <div style={styles.weekdayHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={styles.weekdayCell}>{day}</div>
        ))}
      </div>
      
      <div style={styles.monthGrid}>
        {days.map((day, idx) => {
          const dayEvents = day ? getEventsForDay(day) : [];
          const isToday = day && isSameDay(day, new Date());
          
          return (
            <div
              key={idx}
              style={{
                ...styles.dayCell,
                ...(isToday ? styles.dayCellToday : {}),
                ...(day ? {} : styles.dayCellEmpty)
              }}
              onClick={() => day && onDayClick(day)}
            >
              {day && (
                <>
                  <div style={styles.dayNumber}>{day.getDate()}</div>
                  <div style={styles.eventList}>
                    {dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        style={{
                          ...styles.eventChip,
                          backgroundColor: EVENT_TYPE_COLORS[event.event_type] || '#6366f1'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div style={styles.moreEvents}>+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== WEEK VIEW ====================

function WeekView({ currentDate, events, onEventClick }) {
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const timeSlots = useMemo(() => getTimeSlots().slice(8, 21), []);

  const getEventsForDay = (date) => {
    return events.filter(e => isSameDay(e.start_time, date));
  };

  const getEventPosition = (event) => {
    const startHour = event.start_time.getHours();
    const startMin = event.start_time.getMinutes();
    const endHour = event.end_time ? event.end_time.getHours() : startHour + 1;
    const endMin = event.end_time ? event.end_time.getMinutes() : 0;
    
    const top = ((startHour - 8) * 60 + startMin) / (13 * 60) * 100;
    const height = ((endHour - startHour) * 60 + (endMin - startMin)) / (13 * 60) * 100;
    
    return { top: `${top}%`, height: `${Math.max(height, 5)}%` };
  };

  return (
    <div style={styles.weekView}>
      <div style={styles.weekHeader}>
        <div style={styles.timeColumn}></div>
        {weekDays.map(day => (
          <div key={day.toISOString()} style={styles.weekDayHeader}>
            <div style={styles.weekDayName}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div style={{
              ...styles.weekDayNumber,
              ...(isSameDay(day, new Date()) ? styles.weekDayNumberToday : {})
            }}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.weekGrid}>
        <div style={styles.timeColumn}>
          {timeSlots.map(time => (
            <div key={time} style={styles.timeSlot}>{time}</div>
          ))}
        </div>
        
        {weekDays.map(day => {
          const dayEvents = getEventsForDay(day);
          return (
            <div key={day.toISOString()} style={styles.weekDayColumn}>
              {timeSlots.map((_, idx) => (
                <div key={idx} style={styles.weekTimeCell}></div>
              ))}
              {dayEvents.map(event => {
                const pos = getEventPosition(event);
                return (
                  <div
                    key={event.id}
                    style={{
                      ...styles.weekEvent,
                      ...pos,
                      backgroundColor: EVENT_TYPE_COLORS[event.event_type] || '#6366f1'
                    }}
                    onClick={() => onEventClick(event)}
                  >
                    <div style={styles.weekEventTitle}>{event.title}</div>
                    <div style={styles.weekEventTime}>
                      {formatTime(event.start_time)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== DAY VIEW ====================

function DayView({ currentDate, events, onEventClick }) {
  const timeSlots = useMemo(() => getTimeSlots(), []);
  const dayEvents = useMemo(() => events.filter(e => isSameDay(e.start_time, currentDate)), [events, currentDate]);

  const getEventPosition = (event) => {
    const startHour = event.start_time.getHours();
    const startMin = event.start_time.getMinutes();
    const endHour = event.end_time ? event.end_time.getHours() : startHour + 1;
    const endMin = event.end_time ? event.end_time.getMinutes() : 0;
    
    const top = (startHour * 60 + startMin) / (24 * 60) * 100;
    const height = ((endHour - startHour) * 60 + (endMin - startMin)) / (24 * 60) * 100;
    
    return { top: `${top}%`, height: `${Math.max(height, 3)}%` };
  };

  return (
    <div style={styles.dayView}>
      <div style={styles.dayGrid}>
        <div style={styles.timeColumn}>
          {timeSlots.map(time => (
            <div key={time} style={styles.timeSlot}>{time}</div>
          ))}
        </div>
        
        <div style={styles.dayColumn}>
          {timeSlots.map((_, idx) => (
            <div key={idx} style={styles.dayTimeCell}></div>
          ))}
          {dayEvents.map(event => {
            const pos = getEventPosition(event);
            return (
              <div
                key={event.id}
                style={{
                  ...styles.dayEvent,
                  ...pos,
                  backgroundColor: EVENT_TYPE_COLORS[event.event_type] || '#6366f1'
                }}
                onClick={() => onEventClick(event)}
              >
                <div style={styles.dayEventTitle}>{event.title}</div>
                <div style={styles.dayEventTime}>
                  {formatTime(event.start_time)} - {event.end_time ? formatTime(event.end_time) : ''}
                </div>
                {event.description && (
                  <div style={styles.dayEventDesc}>{event.description}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== MINI CALENDAR ====================

function MiniCalendar({ currentDate, onDateSelect }) {
  const [miniDate, setMiniDate] = useState(currentDate);
  const days = useMemo(() => getMonthDays(miniDate.getFullYear(), miniDate.getMonth()), [miniDate]);

  return (
    <div style={styles.miniCalendar}>
      <div style={styles.miniHeader}>
        <button
          onClick={() => setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() - 1, 1))}
          style={styles.miniNavButton}
        >
          ‹
        </button>
        <div style={styles.miniTitle}>
          {miniDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </div>
        <button
          onClick={() => setMiniDate(new Date(miniDate.getFullYear(), miniDate.getMonth() + 1, 1))}
          style={styles.miniNavButton}
        >
          ›
        </button>
      </div>

      <div style={styles.miniWeekdays}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
          <div key={idx} style={styles.miniWeekday}>{day}</div>
        ))}
      </div>

      <div style={styles.miniGrid}>
        {days.map((day, idx) => {
          const isToday = day && isSameDay(day, new Date());
          const isSelected = day && isSameDay(day, currentDate);
          
          return (
            <div
              key={idx}
              style={{
                ...styles.miniDay,
                ...(isToday ? styles.miniDayToday : {}),
                ...(isSelected ? styles.miniDaySelected : {}),
                ...(day ? {} : styles.miniDayEmpty)
              }}
              onClick={() => day && onDateSelect(day)}
            >
              {day ? day.getDate() : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== EVENT MODAL ====================

function EventModal({ event, initialDate, agents, onSave, onClose }) {
  const [formData, setFormData] = useState({
    title: event?.title || '',
    description: event?.description || '',
    event_type: event?.event_type || 'meeting',
    start_time: event?.start_time ? formatDateTime(event.start_time) : initialDate ? formatDateTime(initialDate) : '',
    end_time: event?.end_time ? formatDateTime(event.end_time) : '',
    all_day: event?.all_day || false,
    recurrence_rule: event?.recurrence_rule || 'none',
    location: event?.location || '',
    attendees: event?.attendees || [],
    reminders: event?.reminders?.length > 0 ? event.reminders[0].minutes_before : 15
  });

  const [selectedAttendees, setSelectedAttendees] = useState(
    event?.attendees?.map(a => a.attendee_id) || []
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const eventData = {
      title: formData.title,
      description: formData.description,
      event_type: formData.event_type,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: formData.end_time ? new Date(formData.end_time).toISOString() : null,
      all_day: formData.all_day,
      recurrence_rule: formData.recurrence_rule !== 'none' ? formData.recurrence_rule : null,
      location: formData.location,
      attendees: selectedAttendees.map(id => ({
        id,
        type: id.startsWith('agent_') ? 'agent' : 'human',
        role: 'required'
      })),
      reminders: formData.reminders ? [{
        minutes_before: parseInt(formData.reminders),
        method: 'chat'
      }] : []
    };
    
    onSave(eventData);
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{event ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Type</label>
            <select
              value={formData.event_type}
              onChange={(e) => setFormData({...formData, event_type: e.target.value})}
              style={styles.select}
            >
              <option value="meeting">Meeting</option>
              <option value="deadline">Deadline</option>
              <option value="reminder">Reminder</option>
              <option value="sprint">Sprint</option>
            </select>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Date & Time *</label>
              <input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>End Date & Time</label>
              <input
                type="datetime-local"
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.all_day}
                onChange={(e) => setFormData({...formData, all_day: e.target.checked})}
                style={styles.checkbox}
              />
              All day event
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Recurrence</label>
            <select
              value={formData.recurrence_rule}
              onChange={(e) => setFormData({...formData, recurrence_rule: e.target.value})}
              style={styles.select}
            >
              {RECURRENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Attendees</label>
            <div style={styles.attendeeList}>
              {agents.map(agent => (
                <label key={agent.id} style={styles.attendeeItem}>
                  <input
                    type="checkbox"
                    checked={selectedAttendees.includes(agent.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAttendees([...selectedAttendees, agent.id]);
                      } else {
                        setSelectedAttendees(selectedAttendees.filter(id => id !== agent.id));
                      }
                    }}
                    style={styles.checkbox}
                  />
                  {agent.name || agent.id}
                </label>
              ))}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Reminder</label>
            <select
              value={formData.reminders}
              onChange={(e) => setFormData({...formData, reminders: e.target.value})}
              style={styles.select}
            >
              <option value="">No reminder</option>
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.saveButton}>
              {event ? 'Update' : 'Create'} Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== EVENT DETAIL MODAL ====================

function EventDetailModal({ event, onEdit, onDelete, onRSVP, onClose }) {
  const currentUserId = localStorage.getItem('user_id');
  const currentAttendee = event.attendees?.find(a => a.attendee_id === currentUserId);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{event.title}</h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <div style={styles.detailContent}>
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Type</div>
            <div style={{
              ...styles.typeBadge,
              backgroundColor: EVENT_TYPE_COLORS[event.event_type]
            }}>
              {event.event_type}
            </div>
          </div>

          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>When</div>
            <div style={styles.detailValue}>
              {event.all_day ? (
                event.start_time.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })
              ) : (
                <>
                  {event.start_time.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                  <br />
                  {formatTime(event.start_time)} - {event.end_time ? formatTime(event.end_time) : 'No end time'}
                </>
              )}
            </div>
          </div>

          {event.description && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>Description</div>
              <div style={styles.detailValue}>{event.description}</div>
            </div>
          )}

          {event.location && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>Location</div>
              <div style={styles.detailValue}>{event.location}</div>
            </div>
          )}

          {event.recurrence_rule && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>Recurrence</div>
              <div style={styles.detailValue}>
                {RECURRENCE_OPTIONS.find(o => o.value === event.recurrence_rule)?.label || event.recurrence_rule}
              </div>
            </div>
          )}

          {event.attendees && event.attendees.length > 0 && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>Attendees ({event.attendees.length})</div>
              <div style={styles.attendeesList}>
                {event.attendees.map(attendee => (
                  <div key={attendee.id} style={styles.attendeeRow}>
                    <div style={styles.attendeeName}>
                      {attendee.attendee_type === 'agent' ? '🤖 ' : ''}
                      {attendee.attendee_id}
                      {attendee.role === 'organizer' && <span style={styles.organizerBadge}>Organizer</span>}
                    </div>
                    <div style={{
                      ...styles.statusBadge,
                      ...(attendee.status === 'accepted' ? styles.statusAccepted :
                          attendee.status === 'declined' ? styles.statusDeclined :
                          attendee.status === 'tentative' ? styles.statusTentative :
                          styles.statusPending)
                    }}>
                      {attendee.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentAttendee && currentAttendee.status === 'pending' && (
            <div style={styles.rsvpSection}>
              <div style={styles.detailLabel}>Your Response</div>
              <div style={styles.rsvpButtons}>
                <button
                  onClick={() => onRSVP(event.id, 'accepted')}
                  style={{...styles.rsvpButton, ...styles.rsvpAccept}}
                >
                  Accept
                </button>
                <button
                  onClick={() => onRSVP(event.id, 'tentative')}
                  style={{...styles.rsvpButton, ...styles.rsvpTentative}}
                >
                  Tentative
                </button>
                <button
                  onClick={() => onRSVP(event.id, 'declined')}
                  style={{...styles.rsvpButton, ...styles.rsvpDecline}}
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={styles.modalActions}>
          <button onClick={onDelete} style={styles.deleteButton}>Delete</button>
          <div style={{flex: 1}}></div>
          <button onClick={onEdit} style={styles.editButton}>Edit</button>
        </div>
      </div>
    </div>
  );
}

// ==================== STYLES ====================

const styles = {
  container: {
    width: '100%',
    height: '100vh',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, sans-serif'
  },
  
  // Toolbar
  toolbar: {
    height: 70,
    backgroundColor: '#1a1a2e',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 15
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 20
  },
  navButton: {
    width: 40,
    height: 40,
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
    color: 'white',
    fontSize: 24,
    cursor: 'pointer',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  todayButton: {
    height: 40,
    padding: '0 20px',
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
    color: 'white',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 8,
    transition: 'all 0.2s'
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    margin: 0
  },
  viewSwitcher: {
    display: 'flex',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 4,
    gap: 4
  },
  viewButton: {
    padding: '8px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  viewButtonActive: {
    backgroundColor: '#0066ff',
    color: 'white'
  },
  createButton: {
    height: 40,
    padding: '0 24px',
    border: 'none',
    backgroundColor: '#0066ff',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 8,
    transition: 'all 0.2s'
  },

  // Content
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  mainPanel: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: 18,
    color: '#666'
  },

  // Month View
  monthView: {
    padding: 20
  },
  weekdayHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 1,
    marginBottom: 10
  },
  weekdayCell: {
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 14,
    color: '#666',
    padding: 10
  },
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 1,
    backgroundColor: '#e5e5e5'
  },
  dayCell: {
    minHeight: 120,
    backgroundColor: 'white',
    padding: 8,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  dayCellToday: {
    backgroundColor: '#f0f7ff'
  },
  dayCellEmpty: {
    backgroundColor: '#f9f9f9',
    cursor: 'default'
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    marginBottom: 4
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  eventChip: {
    fontSize: 11,
    color: 'white',
    padding: '4px 6px',
    borderRadius: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  moreEvents: {
    fontSize: 11,
    color: '#666',
    padding: '4px 6px',
    fontWeight: 500
  },

  // Week View
  weekView: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  weekHeader: {
    display: 'flex',
    borderBottom: '2px solid #e5e5e5',
    backgroundColor: 'white',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  timeColumn: {
    width: 80,
    flexShrink: 0
  },
  weekDayHeader: {
    flex: 1,
    textAlign: 'center',
    padding: 15,
    borderLeft: '1px solid #e5e5e5'
  },
  weekDayName: {
    fontSize: 12,
    color: '#666',
    fontWeight: 500,
    textTransform: 'uppercase'
  },
  weekDayNumber: {
    fontSize: 24,
    fontWeight: 600,
    color: '#333',
    marginTop: 5
  },
  weekDayNumberToday: {
    color: '#0066ff'
  },
  weekGrid: {
    flex: 1,
    display: 'flex',
    position: 'relative',
    overflow: 'auto'
  },
  timeSlot: {
    height: 60,
    borderBottom: '1px solid #e5e5e5',
    fontSize: 12,
    color: '#999',
    padding: '5px 10px',
    textAlign: 'right'
  },
  weekDayColumn: {
    flex: 1,
    borderLeft: '1px solid #e5e5e5',
    position: 'relative'
  },
  weekTimeCell: {
    height: 60,
    borderBottom: '1px solid #f0f0f0'
  },
  weekEvent: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 4,
    padding: 6,
    color: 'white',
    fontSize: 12,
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
  },
  weekEventTitle: {
    fontWeight: 600,
    marginBottom: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  weekEventTime: {
    fontSize: 11,
    opacity: 0.9
  },

  // Day View
  dayView: {
    height: '100%',
    overflow: 'auto'
  },
  dayGrid: {
    display: 'flex',
    minHeight: '100%'
  },
  dayColumn: {
    flex: 1,
    position: 'relative',
    borderLeft: '1px solid #e5e5e5'
  },
  dayTimeCell: {
    height: 60,
    borderBottom: '1px solid #f0f0f0'
  },
  dayEvent: {
    position: 'absolute',
    left: 10,
    right: 10,
    borderRadius: 6,
    padding: 12,
    color: 'white',
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  },
  dayEventTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 6
  },
  dayEventTime: {
    fontSize: 13,
    opacity: 0.95,
    marginBottom: 6
  },
  dayEventDesc: {
    fontSize: 13,
    opacity: 0.9,
    marginTop: 6
  },

  // Mini Calendar
  miniCalendar: {
    width: 300,
    backgroundColor: 'white',
    margin: 20,
    marginLeft: 0,
    padding: 20,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    flexShrink: 0
  },
  miniHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15
  },
  miniTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333'
  },
  miniNavButton: {
    width: 28,
    height: 28,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#666',
    fontSize: 18,
    cursor: 'pointer',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniWeekdays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
    marginBottom: 8
  },
  miniWeekday: {
    fontSize: 11,
    fontWeight: 600,
    color: '#999',
    textAlign: 'center'
  },
  miniGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4
  },
  miniDay: {
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: '#333',
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  miniDayToday: {
    backgroundColor: '#f0f7ff',
    fontWeight: 600,
    color: '#0066ff'
  },
  miniDaySelected: {
    backgroundColor: '#0066ff',
    color: 'white',
    fontWeight: 600
  },
  miniDayEmpty: {
    color: '#ccc',
    cursor: 'default'
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottom: '1px solid #e5e5e5'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    color: '#1a1a2e'
  },
  closeButton: {
    width: 32,
    height: 32,
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: 28,
    color: '#999',
    cursor: 'pointer',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalForm: {
    padding: 20
  },
  formGroup: {
    marginBottom: 20
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 15
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    marginBottom: 8
  },
  input: {
    width: '100%',
    padding: 10,
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Inter, sans-serif'
  },
  textarea: {
    width: '100%',
    padding: 10,
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    resize: 'vertical'
  },
  select: {
    width: '100%',
    padding: 10,
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: 'white'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#333',
    cursor: 'pointer'
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer'
  },
  attendeeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 150,
    overflow: 'auto',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: 10
  },
  attendeeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    cursor: 'pointer'
  },
  modalActions: {
    display: 'flex',
    gap: 10,
    padding: 20,
    borderTop: '1px solid #e5e5e5'
  },
  cancelButton: {
    padding: '10px 20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    color: '#666',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  saveButton: {
    padding: '10px 20px',
    border: 'none',
    backgroundColor: '#0066ff',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  editButton: {
    padding: '10px 20px',
    border: 'none',
    backgroundColor: '#0066ff',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 6
  },
  deleteButton: {
    padding: '10px 20px',
    border: '1px solid #ef4444',
    backgroundColor: 'white',
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6
  },

  // Event Detail
  detailContent: {
    padding: 20
  },
  detailSection: {
    marginBottom: 20
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8
  },
  detailValue: {
    fontSize: 15,
    color: '#333',
    lineHeight: 1.6
  },
  typeBadge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'white',
    textTransform: 'capitalize'
  },
  attendeesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  attendeeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  organizerBadge: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#e5e5e5',
    padding: '2px 8px',
    borderRadius: 4
  },
  statusBadge: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 4,
    fontWeight: 500,
    textTransform: 'capitalize'
  },
  statusAccepted: {
    backgroundColor: '#d1fae5',
    color: '#065f46'
  },
  statusDeclined: {
    backgroundColor: '#fee2e2',
    color: '#991b1b'
  },
  statusTentative: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  statusPending: {
    backgroundColor: '#e5e5e5',
    color: '#666'
  },
  rsvpSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTop: '2px solid #e5e5e5'
  },
  rsvpButtons: {
    display: 'flex',
    gap: 10
  },
  rsvpButton: {
    flex: 1,
    padding: '12px 20px',
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  rsvpAccept: {
    backgroundColor: '#10b981',
    color: 'white'
  },
  rsvpTentative: {
    backgroundColor: '#f59e0b',
    color: 'white'
  },
  rsvpDecline: {
    backgroundColor: '#ef4444',
    color: 'white'
  }
};
