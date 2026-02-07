# Requirements

## v1 Requirements

### Model Discovery
- [ ] **DISC-01**: User can view Available Cloud Models from Ollama API/library
- [ ] **DISC-02**: Available models exclude those already in user's My Models list
- [ ] **DISC-03**: Cloud models display name, description, and size if available

### Model Curation
- [ ] **CUR-01**: User can add a Cloud Model to their My Models list
- [ ] **CUR-02**: User can remove a model from their My Models list
- [ ] **CUR-03**: Removing from My Models returns model to Available Cloud Models
- [ ] **CUR-04**: My Models list persists across app restarts

### Default Model
- [ ] **DEF-01**: User can set one model from My Models as default
- [ ] **DEF-02**: Default model is pre-selected in chat dropdown for new chats
- [ ] **DEF-03**: Changing default updates immediately for future chats

### Chat Dropdown
- [ ] **DROP-01**: Model dropdown shows only My Models (not all fetched)
- [ ] **DROP-02**: Dropdown shows empty state if My Models is empty
- [ ] **DROP-03**: Selected model in dropdown is used for chat requests

### Settings UI
- [ ] **UI-01**: Settings > Models shows two sections: Available Cloud Models and My Models
- [ ] **UI-02**: Cloud Models section has "+ Add" button for each model
- [ ] **UI-03**: My Models section has remove button and "Set Default" option
- [ ] **UI-04**: My Models shows which model is currently default

## v2 Requirements (Deferred)

- Pull status indicators showing if model is downloaded locally
- One-click pull from cloud to local
- Custom model configurations (temperature, context window)
- Usage tracking per model

## Out of Scope

- **Model pulling** — v1 only shows status, doesn't trigger pulls via UI
- **Usage quotas** — no rate limiting needed for personal use
- **Custom configs** — keep model selection simple, no per-model settings
- **Cross-device sync** — model lists are local-only for v1
- **Manual model entry** — removed in favor of cloud model browser

## Traceability

| Requirement | Phase | Plan |
|-------------|-------|------|
| DISC-01 | 1 | - |
| DISC-02 | 1 | - |
| DISC-03 | 1 | - |
| CUR-01 | 1 | - |
| CUR-02 | 1 | - |
| CUR-03 | 1 | - |
| CUR-04 | 1 | - |
| DEF-01 | 2 | - |
| DEF-02 | 2 | - |
| DEF-03 | 2 | - |
| DROP-01 | 2 | - |
| DROP-02 | 2 | - |
| DROP-03 | 2 | - |
| UI-01 | 1 | - |
| UI-02 | 1 | - |
| UI-03 | 1 | - |
| UI-04 | 1 | - |
