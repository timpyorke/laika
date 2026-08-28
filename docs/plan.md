# Laika Development Plan

เอกสารนี้เป็นแผนหลักสำหรับพัฒนา Laika จาก Tauri scaffold ไปสู่ local-first desktop REST client ที่ใช้งานจริง โดยเรียงงานตาม dependency และความเสี่ยงของระบบ

## Product Goal

Laika ใช้สำหรับสร้าง ส่ง ตรวจสอบ และจัดระเบียบ HTTP API requests โดยมีหลักสำคัญดังนี้:

- ใช้งาน request/response workflow ได้รวดเร็วและเชื่อถือได้
- ให้ Rust เป็น HTTP engine เพื่อไม่ติดข้อจำกัด CORS ของ browser
- เก็บ collections, history และ workspace data ไว้ในเครื่อง
- แยก secrets ออกจากข้อมูลทั่วไปและจัดเก็บอย่างปลอดภัย
- วาง architecture ให้ต่อยอด API testing และ CLI ได้ในภายหลัง

## Delivery Strategy

- พัฒนาเป็น vertical slice โดยทุก phase ต้องจบเป็น workflow ที่ทดลองใช้ได้
- ทำ HTTP core ให้ถูกต้องก่อนเพิ่ม persistence และ feature ขั้นสูง
- TypeScript และ Rust ใช้ request/response contract ที่มี type ชัดเจน
- Database migration ต้อง versioned ตั้งแต่เริ่มใช้ SQLite
- Secrets ต้องไม่ปรากฏใน logs, history หรือ error messages
- แต่ละ phase ต้องผ่าน Definition of Done ก่อนเริ่ม phase ที่พึ่งพากัน

## Phase Overview

| Phase | Milestone | Outcome | Status |
| --- | --- | --- | --- |
| 0 | Project Bootstrap | โปรเจกต์ build และสร้าง Windows installer ได้ | Complete |
| 1 | Application Foundation | UI shell, state และ frontend structure พร้อมพัฒนา feature | Planned |
| 2 | REST Request MVP | สร้างและส่ง request พร้อมดู response ได้จริง | Planned |
| 3 | Local Workspace | บันทึก collections และ history ด้วย SQLite | Planned |
| 4 | Environments and Secrets | ใช้ variables และ auth secrets อย่างปลอดภัย | Planned |
| 5 | Workflow Polish | ใช้งานประจำวันได้คล่องและจัดการข้อมูลได้ครบขึ้น | Planned |
| 6 | API Testing | สร้าง assertions และรัน test cases ได้ | Planned |
| 7 | Release Readiness | พร้อมแจกจ่าย ใช้งาน และอัปเกรดข้อมูลอย่างมั่นใจ | Planned |

Checklist convention:

- `[ ]` ยังไม่เสร็จ
- `[x]` เสร็จและตรวจสอบแล้ว
- เปลี่ยนสถานะในตารางเป็น `In Progress` เมื่อเริ่ม phase
- เปลี่ยนสถานะเป็น `Complete` เมื่อผ่าน Definition of Done ทั้งหมด

## Phase 0: Project Bootstrap

เป้าหมาย: เตรียม desktop application baseline ที่ build ซ้ำได้

### Checklist

- [x] Scaffold Tauri 2 + React + TypeScript + Vite
- [x] ใช้ pnpm และสร้าง lockfile
- [x] ติดตั้ง Rust toolchain ผ่าน rustup
- [x] ตรวจสอบ frontend production build
- [x] ตรวจสอบ Tauri release build บน Windows
- [x] สร้าง `.exe`, MSI และ NSIS installer ได้
- [x] อัปเดต README ให้ตรงกับ product direction และโครงสร้างปัจจุบัน

### Definition of Done

- [x] `pnpm build` ผ่าน
- [x] `pnpm tauri build` ผ่าน
- [x] Windows artifacts ถูกสร้างใน `src-tauri/target/release/`

## Phase 1: Application Foundation

เป้าหมาย: เปลี่ยน scaffold UI ให้เป็นโครง application ที่รองรับ REST client workflows

### Checklist

- [ ] เพิ่ม Tailwind CSS และ shadcn/ui
- [ ] เพิ่ม Zustand สำหรับ application state
- [ ] สร้าง application shell: sidebar, request workspace และ response panel
- [ ] สร้าง shared UI primitives เช่น tabs, inputs, table rows, resizable panels และ dialogs
- [ ] แยก frontend ตาม feature เช่น `request`, `response`, `collections`, `history` และ `environments`
- [ ] กำหนด TypeScript models สำหรับ request draft, HTTP response และ application errors
- [ ] เพิ่ม theme tokens สำหรับ light/dark mode และ HTTP status colors
- [ ] วาง error boundary และ notification system

### Deliverables

- [ ] หน้าหลักเป็น REST client workspace แทนหน้า Tauri ตัวอย่าง
- [ ] UI รองรับ desktop window ขนาดเล็กและใหญ่โดยไม่เกิด overlap
- [ ] State ของ request draft เปลี่ยน method, URL และ tabs ได้

### Definition of Done

- [ ] ไม่มี sample `greet` workflow เหลือในหน้าหลัก
- [ ] UI controls ใช้งานด้วย keyboard ได้ใน workflow หลัก
- [ ] `pnpm build` ผ่านโดยไม่มี TypeScript errors

## Phase 2: REST Request MVP

เป้าหมาย: ผู้ใช้สร้าง ส่ง และตรวจสอบ HTTP request ได้จริงแบบ end-to-end

### Frontend Checklist

- [ ] Method selector: GET, POST, PUT, PATCH, DELETE, HEAD และ OPTIONS
- [ ] URL input และ Send/Cancel controls
- [ ] Query params editor แบบ key/value พร้อม enable/disable row
- [ ] Headers editor แบบ key/value พร้อม enable/disable row
- [ ] Body modes: none, JSON, text และ form URL encoded
- [ ] Basic Auth และ Bearer Token input
- [ ] Response view: status, elapsed time, size, headers และ body
- [ ] JSON formatting, raw text view และ copy response
- [ ] Loading, timeout, invalid URL, TLS และ network error states

### Rust HTTP Engine Checklist

- [ ] เพิ่ม `reqwest` และสร้าง Tauri command สำหรับ execute request
- [ ] Validate และ normalize request input
- [ ] รองรับ methods, query params, headers, body และ auth ตาม UI
- [ ] วัด elapsed time และ response size
- [ ] ส่ง status, headers และ body กลับผ่าน serializable contract
- [ ] จำกัด response size เพื่อป้องกัน memory exhaustion
- [ ] เพิ่ม configurable timeout และ cancel mechanism
- [ ] ป้องกัน sensitive headers จาก debug logs

### Test Checklist

- [ ] Rust unit tests สำหรับ request validation และ response mapping
- [ ] Integration tests กับ local mock HTTP server
- [ ] Frontend tests สำหรับ request serialization และ UI error states
- [ ] Manual smoke test: GET JSON, POST JSON, auth, timeout และ non-2xx response

### Definition of Done

- [ ] ส่ง request ไปยัง HTTP/HTTPS endpoint ได้โดยไม่พึ่ง browser CORS
- [ ] Request ทุกส่วนที่แสดงใน UI ถูกส่งไป Rust อย่างถูกต้อง
- [ ] Response แสดง status, time, size, headers และ body ได้
- [ ] Cancel และ timeout หยุด request ได้โดย UI ไม่ค้าง
- [ ] Error ที่ผู้ใช้แก้ไขได้มีข้อความชัดเจนและไม่เปิดเผย secrets

## Phase 3: Local Workspace

เป้าหมาย: ผู้ใช้จัดเก็บ requests และกลับมาทำงานต่อได้หลังปิดแอป

### Checklist

- [ ] เพิ่ม SQLite และเลือก Tauri-compatible database integration
- [ ] สร้าง migration system และ schema versioning
- [ ] ออกแบบ entities: workspace, collection, folder, request และ history entry
- [ ] สร้าง repository layer ฝั่ง Rust แยกจาก Tauri commands
- [ ] CRUD collections, folders และ saved requests
- [ ] บันทึก history หลัง request จบทั้ง success และ failure ที่เหมาะสม
- [ ] เปิด request จาก collection/history กลับเข้า editor
- [ ] เพิ่ม search, rename, duplicate, move และ delete
- [ ] กำหนด retention policy และ clear history
- [ ] ไม่เก็บ auth secrets ลง SQLite

### Data Checklist

- [ ] เก็บ request metadata และ non-secret values เป็น structured data
- [ ] เก็บ body ขนาดใหญ่ด้วย limit ที่กำหนด
- [ ] ใช้ foreign keys และ transaction สำหรับการย้าย/ลบข้อมูล
- [ ] Migration รองรับการอัปเกรดจาก schema version ก่อนหน้า

### Definition of Done

- [ ] Saved requests และ collections ยังอยู่หลัง restart
- [ ] History ถูกสร้างเมื่อ request ทำงานจบและเปิดซ้ำได้
- [ ] Migration ทำงานกับ database ใหม่และ database version ก่อนหน้า
- [ ] Database failure แสดง recoverable error โดยไม่ทำให้แอปปิด

## Phase 4: Environments and Secrets

เป้าหมาย: ผู้ใช้เปลี่ยน configuration ระหว่าง environments และเก็บ credentials อย่างปลอดภัย

### Checklist

- [ ] สร้าง environment และ variable manager
- [ ] รองรับ active environment และ global/workspace variables
- [ ] ใช้ variable syntax เช่น `{{baseUrl}}`
- [ ] Resolve variables ใน URL, params, headers, body และ auth ก่อนส่ง
- [ ] แสดง unresolved variables ก่อน execute request
- [ ] แยก regular values กับ secret values
- [ ] เพิ่ม Stronghold สำหรับ token, password และ API key
- [ ] ใช้ opaque secret references ใน SQLite
- [ ] Mask secrets ใน UI พร้อม explicit reveal/copy actions
- [ ] Redact secrets จาก logs, history, errors และ exported data โดยค่าเริ่มต้น

### Definition of Done

- [ ] สลับ environment แล้ว request ใช้ค่าชุดใหม่ทันที
- [ ] Undefined variable ไม่ถูกส่งโดยเงียบ ๆ
- [ ] Secrets ไม่ถูกบันทึกเป็น plaintext ใน SQLite
- [ ] Restart แอปแล้ว secret references ยังใช้งานได้
- [ ] Export ปกติไม่มี secrets เว้นแต่ผู้ใช้เลือกและยืนยันอย่างชัดเจน

## Phase 5: Workflow Polish

เป้าหมาย: ทำให้ Laika ใช้งานเป็นเครื่องมือประจำวันได้เร็วและคาดเดาได้

### Checklist

- [ ] เพิ่ม Monaco Editor สำหรับ JSON และ raw body/response
- [ ] เพิ่ม syntax highlighting, format, validation และ line wrapping
- [ ] เพิ่ม request tabs พร้อม dirty state และ confirm ก่อนปิด
- [ ] เพิ่ม keyboard shortcuts สำหรับ send, save, new request และ tab navigation
- [ ] ทำ resizable/collapsible sidebar และ response panel
- [ ] เพิ่ม response search และ header filtering
- [ ] Generate code snippets เช่น cURL
- [ ] Import cURL และ export/import Laika collections
- [ ] เพิ่ม duplicate request และ save-as workflow
- [ ] ทำ empty, loading และ error states ให้ครบ
- [ ] ตรวจ accessibility: focus order, labels, contrast และ reduced motion

### Definition of Done

- [ ] Workflow สร้าง request, ส่ง, ตรวจ response และบันทึก ทำได้โดย keyboard
- [ ] Unsaved changes ไม่สูญหายโดยไม่มีคำเตือน
- [ ] Import/export round trip รักษาข้อมูล non-secret ได้ครบ
- [ ] JSON ขนาดทั่วไปเปิดและค้นหาได้โดย UI ยังตอบสนองดี

## Phase 6: API Testing

เป้าหมาย: ต่อ REST client ให้รองรับ repeatable API checks

### Checklist

- [ ] สร้าง assertion model สำหรับ status, headers, JSON path และ response time
- [ ] สร้าง test result view พร้อม pass/fail และ failure details
- [ ] เพิ่ม collection runner แบบ sequential execution
- [ ] รองรับ environment selection สำหรับ test run
- [ ] เพิ่ม run summary และ persisted test results
- [ ] Export machine-readable results สำหรับ CI
- [ ] ออกแบบ shared core contract สำหรับ CLI companion
- [ ] ประเมิน pre-request และ post-response scripting พร้อม security boundary

### Definition of Done

- [ ] สร้าง assertions ให้ request และเห็นผลทุก assertion ได้
- [ ] รัน collection แล้วได้ summary ที่ทำซ้ำได้
- [ ] Failure ระบุ expected/actual และ request ที่เกี่ยวข้อง
- [ ] Test result export ใช้ต่อใน automation ได้

## Phase 7: Release Readiness

เป้าหมาย: เตรียมแอปสำหรับแจกจ่ายและดูแลหลัง release

### Checklist

- [ ] ตั้งค่า production app metadata, icons, versioning และ bundle identifiers
- [ ] ทำ code signing สำหรับ Windows installer
- [ ] เพิ่ม updater strategy และ release channel
- [ ] สร้าง CI สำหรับ frontend checks, Rust tests และ Tauri builds
- [ ] ทำ backup/restore และ database recovery workflow
- [ ] ตรวจ security: secret handling, command permissions, CSP และ dependency audit
- [ ] ทำ performance tests สำหรับ history/database และ large responses
- [ ] เพิ่ม crash/error diagnostics แบบ opt-in และไม่มี sensitive data
- [ ] เขียน user documentation และ release checklist

### Definition of Done

- [ ] Clean machine ติดตั้ง เปิด ใช้งาน และถอนการติดตั้งได้
- [ ] Upgrade version ไม่ทำให้ workspace data สูญหาย
- [ ] Release artifacts สร้างจาก CI และตรวจสอบย้อนกลับได้
- [ ] Security และ privacy checklist ผ่านก่อน publish

## Cross-Phase Quality Gates

ใช้รายการนี้ปิดงานของ phase ที่กำลังพัฒนา และ reset หลังเริ่ม phase ถัดไป:

- [ ] Frontend: typecheck และ production build ผ่าน
- [ ] Rust: format, lint และ tests ผ่าน
- [ ] Contract: frontend/backend payload มี validation และ backward compatibility ที่จำเป็น
- [ ] UX: loading, empty, success และ error states ครบ
- [ ] Security: secrets ไม่เข้า logs, history หรือ error payload
- [ ] Data: schema changes มี migration และ recovery consideration
- [ ] Documentation: README และแผนนี้อัปเดตเมื่อ scope หรือสถานะเปลี่ยน

## Suggested Commands

```bash
pnpm build
pnpm tauri dev
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

## Immediate Next Milestone

เริ่ม Phase 1 และ Phase 2 ตามลำดับต่อไปนี้:

1. ติดตั้ง UI/state dependencies และสร้าง application shell
2. กำหนด shared request/response contract
3. สร้าง request editor state และ UI controls
4. เพิ่ม Rust `reqwest` command พร้อม local mock tests
5. เชื่อม React กับ Tauri command
6. เพิ่ม response viewer, cancellation และ error handling
7. ทำ smoke test และปิดเกณฑ์ REST Request MVP

## Scope Control

สิ่งที่ยังไม่ควรเริ่มก่อน REST Request MVP ผ่าน:

- Cloud sync และ user accounts
- Team collaboration
- Plugin marketplace
- GraphQL/gRPC/WebSocket clients
- Full scripting runtime
- CLI implementation

รายการเหล่านี้ควรประเมินใหม่จาก usage feedback หลัง local REST workflow มีความเสถียรแล้ว
