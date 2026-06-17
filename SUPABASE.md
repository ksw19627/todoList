# SUPABASE.md

localStorage → Supabase 마이그레이션 준비 문서.  
이 앱은 번들러 없는 바닐라 JS이므로 **CDN 방식**으로 연동한다.

---

## 1. Supabase 란?

PostgreSQL 기반 오픈소스 BaaS(Backend as a Service).  
DB·인증·스토리지·실시간 구독을 제공하며, 스키마에서 REST/GraphQL API를 자동 생성한다.  
프리 티어(Free Plan)는 프로젝트 2개, DB 500MB, 월 5GB 대역폭을 무료로 제공한다.

---

## 2. 프로젝트 생성 순서

1. [https://supabase.com](https://supabase.com) 접속 → **Start your project** → GitHub 계정으로 가입
2. 대시보드 → **New project**
   - Organization: 개인 계정 선택
   - Name: `todo-app` (원하는 이름)
   - Database Password: 강한 비밀번호 설정 (나중에 재확인 불가 → 저장 필수)
   - Region: **Northeast Asia (Seoul)** 권장
3. 프로젝트 생성 완료까지 약 1~2분 소요

---

## 3. API 키 확인 (2026 신규 체계)

> ⚠️ 2026년부터 기존 `anon` / `service_role` JWT 키는 연말 폐기 예정.  
> 신규 프로젝트는 **Publishable / Secret 키** 체계를 사용해야 한다.

**대시보드 경로:** `Settings` → `API Keys` → `Publishable and secret API keys` 탭

| 키 종류 | 형식 | 용도 |
|---------|------|------|
| **Publishable key** | `sb_publishable_...` | 클라이언트(브라우저)에서 사용. 기존 anon 키 대체. |
| **Secret key** | `sb_secret_...` | 서버에서만 사용. 절대 프론트엔드 코드에 포함 금지. |

이 앱은 브라우저 전용이므로 **Publishable key** 만 사용한다.

**함께 필요한 값:**  
`Settings` → `API` → **Project URL** (예: `https://abcdefgh.supabase.co`)

---

## 4. 테이블 설계

### 4-1. `todos` 테이블

현재 앱의 상태 모델:
```js
{ id, text, completed, priority: 'high'|'medium'|'low' }
```

드래그 앤 드롭 순서 유지를 위해 `sort_order` 컬럼을 추가한다.

**Table Editor (UI)** 또는 **SQL Editor**에서 아래 SQL을 실행:

```sql
CREATE TABLE todos (
  id          BIGSERIAL PRIMARY KEY,
  text        TEXT        NOT NULL,
  completed   BOOLEAN     NOT NULL DEFAULT FALSE,
  priority    TEXT        NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('high', 'medium', 'low')),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4-2. 컬럼 설명

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | BIGSERIAL | 자동 증가 PK. 기존 `Date.now()` 방식 대체. |
| `text` | TEXT | 할 일 내용 |
| `completed` | BOOLEAN | 완료 여부 |
| `priority` | TEXT + CHECK | `'high'` / `'medium'` / `'low'` 만 허용 |
| `sort_order` | INTEGER | 드래그 순서 저장. 숫자가 작을수록 위에 표시. |
| `created_at` | TIMESTAMPTZ | 생성 시각 (자동) |
| `updated_at` | TIMESTAMPTZ | 수정 시각 — 앱에서 UPDATE 시 함께 갱신 |

### 4-3. `updated_at` 자동 갱신 트리거 (선택)

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 5. RLS (Row Level Security) 설정

현재 앱은 로그인 없이 동작한다.  
일단 **전체 공개 정책**으로 설정하고, 추후 인증 추가 시 사용자별 격리 정책으로 교체한다.

```sql
-- RLS 활성화 (반드시 실행 — 기본은 비활성화)
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- 임시: 누구나 읽기·쓰기 허용 (인증 도입 전 개발용)
CREATE POLICY "public_all" ON todos
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

> 추후 Supabase Auth 도입 시 아래 정책으로 교체:
> ```sql
> CREATE POLICY "owner_only" ON todos
>   FOR ALL
>   USING (auth.uid() = user_id)
>   WITH CHECK (auth.uid() = user_id);
> ```
> (이때 `user_id UUID REFERENCES auth.users` 컬럼도 추가 필요)

---

## 6. 바닐라 JS 연동 (CDN)

번들러 없이 `<script>` 태그로 로드한다.

### index.html — 스크립트 추가

```html
<!-- supabase-js CDN (app.js 보다 먼저 로드) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="app.js"></script>
```

### app.js — 클라이언트 초기화

```js
const SUPABASE_URL = 'https://your-project-id.supabase.co'
const SUPABASE_KEY = 'sb_publishable_...'   // Publishable key (브라우저용)

const { createClient } = supabase           // CDN 로드 후 전역에 supabase 객체 존재
const db = createClient(SUPABASE_URL, SUPABASE_KEY)
```

### CRUD 패턴

```js
// 전체 조회 (sort_order 오름차순)
const { data, error } = await db
  .from('todos')
  .select('*')
  .order('sort_order', { ascending: true })

// 추가
const { data, error } = await db
  .from('todos')
  .insert({ text, completed: false, priority, sort_order })
  .select()
  .single()

// 완료 토글
const { error } = await db
  .from('todos')
  .update({ completed: !todo.completed })
  .eq('id', id)

// 삭제
const { error } = await db
  .from('todos')
  .delete()
  .eq('id', id)

// 드래그 순서 저장 (여러 행 일괄 업데이트)
const updates = todos.map((t, i) => ({ id: t.id, sort_order: i }))
const { error } = await db
  .from('todos')
  .upsert(updates)
```

---

## 7. 마이그레이션 계획 (localStorage → Supabase)

| 단계 | 작업 |
|------|------|
| 1 | Supabase 프로젝트 생성 + 테이블 + RLS 설정 |
| 2 | `index.html`에 CDN 스크립트 추가 |
| 3 | `app.js` 상단에 `createClient` 초기화 |
| 4 | `loadTodos()` → `await db.from('todos').select(...)` 로 교체 |
| 5 | `saveTodos()` 제거 — 각 액션마다 insert/update/delete 직접 호출 |
| 6 | 드래그 드롭 `onDrop()` 에서 `sort_order` 일괄 upsert 호출 |
| 7 | 기존 localStorage 데이터 마이그레이션 (선택) |

---

## 참고 자료

- [Supabase JavaScript 레퍼런스](https://supabase.com/docs/reference/javascript/introduction)
- [새 API 키 체계 마이그레이션 가이드](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [RLS 및 테이블 설계 가이드](https://eastondev.com/blog/en/posts/dev/supabase-database-design/)
- [supabase-js NPM 패키지](https://www.npmjs.com/package/@supabase/supabase-js)
