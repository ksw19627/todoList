# SUPABASE_AUTH.md

Supabase 이메일 인증 도입 가이드. localStorage → Supabase Auth 전환 후 사용자별 데이터 격리 구현.

---

## 1. Supabase Auth 개요

Supabase Auth는 PostgreSQL의 `auth.users` 테이블 기반 인증 시스템이다.
이 앱은 **이메일 + 비밀번호** 방식을 사용한다. OAuth·소셜 로그인은 사용하지 않는다.

인증 흐름:
```
회원가입(signUp) → 세션 발급 → onAuthStateChange('SIGNED_IN') → 투두 뷰 표시
로그인(signInWithPassword) → 세션 발급 → onAuthStateChange('SIGNED_IN') → 투두 뷰 표시
로그아웃(signOut) → 세션 파기 → onAuthStateChange('SIGNED_OUT') → 인증 뷰 표시
새로고침 → INITIAL_SESSION 이벤트 → 세션 있으면 자동 로그인
```

---

## 2. Supabase 대시보드 설정

### 이메일 인증 확인 메일 비활성화 (개발 편의)
```
Authentication → Providers → Email → Confirm email → OFF
```
OFF 시: 회원가입 즉시 세션 발급 → 바로 투두 뷰 진입
ON 시: 회원가입 후 이메일 링크 클릭 필요 → 앱이 안내 메시지 표시

---

## 3. 테이블 변경 SQL (SQL Editor에서 실행)

```sql
-- 1. user_id 컬럼 추가 (기존 anonymous 행은 NULL 유지)
ALTER TABLE todos ADD COLUMN user_id UUID REFERENCES auth.users ON DELETE CASCADE;

-- 2. 기존 공개 정책 제거
DROP POLICY IF EXISTS "public_all" ON todos;

-- 3. 사용자별 격리 정책 (자신의 할 일만 접근 가능)
CREATE POLICY "user_own_todos" ON todos
  FOR ALL
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
```

> ⚠️ 기존 데이터(`user_id = NULL`)는 위 정책 적용 후 모든 사용자에게 보이지 않는다.
> Table Editor에서 해당 행을 삭제하거나 직접 user_id를 채우면 된다.

---

## 4. supabase-js Auth API

### 회원가입
```js
const { data, error } = await db.auth.signUp({ email, password })
// data.session이 null이면 이메일 확인 필요
// data.session이 있으면 onAuthStateChange('SIGNED_IN') 자동 발생
```

### 로그인
```js
const { error } = await db.auth.signInWithPassword({ email, password })
// 성공 시 onAuthStateChange('SIGNED_IN') 자동 발생
```

### 로그아웃
```js
await db.auth.signOut()
// onAuthStateChange('SIGNED_OUT') 자동 발생
```

### 인증 상태 감지 (뷰 전환 핵심)
```js
db.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    currentUser = session.user   // { id, email, ... }
    showTodoView()
    await loadTodos()
    renderTodos()
  } else {
    currentUser = null
    todos = []
    showAuthView()
  }
})
// 지원 이벤트: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
```

### 현재 사용자 가져오기
```js
// 클라이언트에서 빠른 조회 (캐시)
const { data: { session } } = await db.auth.getSession()
const user = session?.user

// 서버에서 인증 검증 (네트워크 요청, 보안)
const { data: { user } } = await db.auth.getUser()
```

---

## 5. INSERT 시 user_id 포함

```js
await db.from('todos').insert({
  text,
  completed: false,
  priority,
  sort_order: insertAt,
  user_id: currentUser.id   // ← 반드시 포함
})
```

RLS 정책이 `auth.uid() = user_id`를 검증하므로,
`currentUser.id`와 실제 로그인 사용자가 다르면 INSERT가 거부된다.

---

## 6. 기존 데이터 처리

기존 익명 데이터를 특정 계정에 귀속시키려면:
```sql
-- 로그인 후 Table Editor에서 해당 user의 UUID를 확인하고 실행
UPDATE todos
SET user_id = '<YOUR_USER_UUID>'
WHERE user_id IS NULL;
```
