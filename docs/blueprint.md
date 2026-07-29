# VocabSprint — Bot specification

**Archetype:** education

**Voice:** motivational and friendly — write every user-facing message, button label, error, and empty state in this voice.

Private spaced-repetition vocabulary trainer with customizable decks, daily study limits, and progress tracking. Users review cards via quick reveal-and-rate interactions, with automated reminders and session persistence.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- language learners
- Telegram users

## Success criteria

- users complete daily review sessions with 90%+ retention
- track progress metrics (streak, learned count) for 30+ days

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with starter deck options and study controls
- **Start Study Session** (button, actor: user, callback: study:start) — Begin studying current deck with reveal-and-rate interface
  - inputs: deck selection
  - outputs: card prompt display, review rating buttons
- **Add Deck** (button, actor: user, callback: deck:create) — Create new deck or import CSV file
  - inputs: deck title, CSV import
  - outputs: deck creation confirmation
- **My Progress** (button, actor: user, callback: progress:view) — Show streak, learned cards, and due reviews
  - inputs: metric filter
  - outputs: progress dashboard

## Flows

### Study Session
_Trigger:_ study:start

1. Show card prompt
2. User reveals answer
3. User rates card (Again/Hard/Good/Easy)
4. Bot schedules next review

_Data touched:_ Card, Session State

### Deck Management
_Trigger:_ deck:create

1. Create deck
2. Add cards via CSV or prompts
3. Edit/delete cards

_Data touched:_ Deck, Card

### Reminder Notification
_Trigger:_ daily_reminder

1. Send due review reminder at 09:00 local time
2. Include count of due cards

_Data touched:_ User Profile

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User Profile** _(retention: persistent)_ — User settings, streak, and study preferences
  - fields: telegram_id, daily_new_card_limit, schedule_intensity, streak_count
- **Deck** _(retention: persistent)_ — Private vocabulary deck with cards
  - fields: title, description, visibility
- **Card** _(retention: persistent)_ — Word/translation pair with spaced-repetition metadata
  - fields: prompt, answer, example, ease, interval, due_date, state
- **Session State** _(retention: session)_ — Current study session progress
  - fields: current_deck_id, current_card_index, paused_position

## Integrations

- **Telegram** (required) — Private chat notifications and interactions
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- configure starter decks
- set default new-card limit
- adjust schedule intensity defaults

## Notifications

- Daily review reminder at 09:00 local time
- Session resumption prompts
- Progress milestone alerts

## Permissions & privacy

- All user data stored privately per Telegram policies
- No third-party data sharing

## Edge cases

- Empty deck handling
- Mid-session exit/resume
- CSV import validation

## Required tests

- End-to-end study session with 10 cards
- Notification timing accuracy
- Deck import/export workflow

## Assumptions

- Default starter decks provided by owner
- SM-2 algorithm implementation
