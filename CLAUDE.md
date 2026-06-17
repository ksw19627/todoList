# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 실행 방법

빌드 도구 없음. `index.html` 을 브라우저에서 직접 열면 된다.

```bash
# 로컬 서버 없이 파일 직접 열기
open index.html          # macOS
xdg-open index.html      # Linux
```

외부 리소스(Google Fonts, Material Icons)는 CDN에서 로드하므로 인터넷 연결이 필요하다.

## Git 규칙

- 브랜치 병합 시 **merge** 사용 — rebase 금지
- git 명령은 이 디렉터리(`vibeCoding-todoList/`) 이하 파일만 대상으로 한다. 상위 디렉터리를 읽거나 수정하지 않는다.

## 아키텍처

파일 3개짜리 바닐라 SPA. 프레임워크·번들러 없음.

```
index.html   — 구조 (헤더, 입력 카드, todo 목록, 빈 상태)
style.css    — Material Design 3 기반 디자인 토큰 + 레이아웃
app.js       — 상태·렌더·이벤트 전부 포함
```

### 상태 모델 (`app.js`)

```js
todos = [{ id: number, text: string, completed: boolean, priority: 'high'|'medium'|'low' }]
```

`todos` 배열 순서 = 화면 표시 순서. 자동 정렬 없음(드래그로 수동 정렬).

### 데이터 흐름

```
사용자 액션
  → addTodo / toggleTodo / deleteTodo / DnD onDrop
  → todos 배열 변경
  → saveTodos()   ← localStorage 직렬화
  → renderTodos() ← #todo-list innerHTML 전체 재렌더
```

### 핵심 함수

| 함수 | 역할 |
|------|------|
| `loadTodos()` | localStorage 파싱; `priority` 없는 구버전 데이터 → `'medium'` 마이그레이션 후 재정렬 |
| `insertByPriority(todo)` | 신규 항목을 같은 우선순위 그룹 끝에 삽입 |
| `renderTodos()` | 전체 재렌더 + 빈 상태 토글 |
| `onDrop(e)` | 드롭 대상의 `priority` 를 드래그 항목에 복사 → 등급 변경 가능 |

### 우선순위 입력

`<select>` 대신 칩(Chip) 버튼. 선택 상태는 `.chip-selected` 클래스로 관리하며 `getSelectedPriority()`가 읽는다.

### CSS 설계 포인트

- 디자인 토큰은 `:root` CSS 변수로 관리 (`--primary`, `--high-c` 등)
- `.todo-item:hover`와 `.todo-item.priority-*`는 명시도가 동일하므로, priority 클래스를 hover 뒤에 선언해 왼쪽 테두리 색이 항상 우선순위 색을 유지하게 함
- LEGO 타이틀: `.lb::before`(스터드 원기둥) + `.lb::after`(돔 꼭대기) 두 의사 요소로 3D 레고 브릭 구현
