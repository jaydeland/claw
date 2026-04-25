# Roadmap

## Overview

**Goal**: Refactor Ollama model settings to allow users to curate a personal list from available Cloud Models, with the selected model used for requests.

**Requirements**: 14 v1 requirements across 3 phases

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | Cloud Model Discovery | Enable browsing and adding cloud models | DISC-01, DISC-02, DISC-03, CUR-01, CUR-04, UI-01, UI-02 |
| 2 | Model Curation & Default | Enable removing, default setting, dropdown filtering | CUR-02, CUR-03, DEF-01, DEF-02, DEF-03, DROP-01, DROP-02, UI-03, UI-04 |
| 3 | Integration & Polish | Wire up selected model to requests, edge cases | DROP-03, testing, backward compatibility |

---

## Phase 1: Cloud Model Discovery

**Goal**: Users can browse available Cloud Models and add them to their personal list.

**Requirements**: DISC-01, DISC-02, DISC-03, CUR-01, CUR-04, UI-01, UI-02

**Success Criteria**:
1. User opens Settings > Models and sees "Available Cloud Models" section
2. Cloud models are fetched from Ollama API/library
3. Models already in My Models don't appear in Cloud list
4. User clicks "+ Add" on a cloud model and it appears in My Models
5. Added model persists after app restart

**Dependencies**: None

---

## Phase 2: Model Curation & Default

**Goal**: Users can manage their curated list and set a default model.

**Requirements**: CUR-02, CUR-03, DEF-01, DEF-02, DEF-03, DROP-01, DROP-02, UI-03, UI-04

**Success Criteria**:
1. User can remove a model from My Models (returns to Cloud list)
2. User can set a model as default
3. Chat model dropdown shows only My Models
4. Default model is pre-selected in dropdown for new chats
5. Changing default updates immediately for future chats

**Dependencies**: Phase 1 (needs My Models list to exist)

---

## Phase 3: Integration & Polish

**Goal**: Ensure selected model is used for requests, handle edge cases.

**Requirements**: DROP-03

**Success Criteria**:
1. Selected model in dropdown is sent with chat requests
2. Empty My Models state shows helpful message
3. Existing user configs migrate correctly
4. Model selection persists across provider switches

**Dependencies**: Phase 2 (needs dropdown and model selection working)

---

## State Tracking

### Current Phase
- Phase 1: Cloud Model Discovery

### Completed Phases
- (None)

### Decisions Made
- Two-list UI pattern (Cloud vs My) for clear separation
- Manual add/remove only, no auto-sync with cloud
- Default model is global, not per-chat
