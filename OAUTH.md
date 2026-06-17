# OAUTH.md

Google / Kakao / Apple 소셜 로그인 도입 가이드.
세 Provider 모두 Supabase가 OAuth 중개자 역할을 하므로, 코드 변경은 동일하고 **외부 콘솔 설정만 다르다**.

---

## 난이도 한눈에 보기

| Provider | 난이도 | 계정 필요 | 유료 여부 |
|----------|--------|-----------|-----------|
| Google   | ⭐ 쉬움 | Google 계정 | 무료 |
| Kakao    | ⭐⭐ 보통 | 카카오 개발자 계정 | 무료 |
| Apple    | ⭐⭐⭐ 어려움 | Apple Developer 계정 | **연 $99** |

---

## 공통 사전 설정 (Supabase 대시보드)

**Redirect URL 등록** — 각 Provider 설정 전 먼저 추가:
```
Authentication → URL Configuration → Redirect URLs → Add URL
```
추가할 URL:
```
https://ksw19627.github.io/todoList/
http://localhost:8080
```

---

## 1. Google

### 난이도: ⭐ (가장 쉬움)

#### 내가 할 일 (Google Cloud Console)
1. [https://console.cloud.google.com](https://console.cloud.google.com) → 프로젝트 생성 (또는 기존 선택)
2. **APIs & Services → OAuth consent screen**
   - User Type: External → 앱 이름, 이메일 입력 → 저장
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs에 추가:
     ```
     https://nysjoqpbycoalthsyydc.supabase.co/auth/v1/callback
     ```
   - 생성 후 **Client ID**와 **Client Secret** 복사

#### 내가 할 일 (Supabase 대시보드)
```
Authentication → Providers → Google → Enable
→ Client ID, Client Secret 붙여넣기 → Save
```

---

## 2. Kakao

### 난이도: ⭐⭐ (보통)

#### 내가 할 일 (Kakao Developers)
1. [https://developers.kakao.com](https://developers.kakao.com) → 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
2. 앱 이름, 사업자명 입력 후 저장
3. **앱 설정 → 앱 키** → **REST API 키** 복사 (Client ID로 사용)
4. **제품 설정 → 카카오 로그인 → 활성화 설정 ON**
5. **제품 설정 → 카카오 로그인 → Redirect URI 등록**:
   ```
   https://nysjoqpbycoalthsyydc.supabase.co/auth/v1/callback
   ```
6. **보안 → Client Secret 코드 생성** → 코드 복사 (Client Secret으로 사용)
7. **동의항목** → 닉네임, 프로필 사진, 이메일 → 필수 또는 선택 동의 설정

> ⚠️ **이메일 동의는 "비즈 앱" 등록 필요**: 카카오 이메일 수집을 원하면 카카오 비즈니스 인증이 필요하다. 개인 앱(일반)은 닉네임·프로필 사진만 수집 가능. Supabase 대시보드에서 `"이메일 없는 사용자 허용"(Allow users without email)` 옵션을 ON 해야 한다.

#### 내가 할 일 (Supabase 대시보드)
```
Authentication → Providers → Kakao → Enable
→ REST API 키(Client ID), Client Secret 붙여넣기 → Save
```

---

## 3. Apple (Sign in with Apple)

### 난이도: ⭐⭐⭐ (복잡, 유료)

> **전제조건**: Apple Developer Program 가입 필요 (연 $99)
> 없으면 구현 불가. Google/Kakao 먼저 구현 후 나중에 추가 권장.

#### 내가 할 일 (Apple Developer Console)
1. [https://developer.apple.com](https://developer.apple.com) → Account → Certificates, Identifiers & Profiles

2. **App ID 생성**
   - Identifiers → + → App IDs → App → Continue
   - Bundle ID: `com.yourname.todolist` (예시)
   - Capabilities에서 **Sign In with Apple** 체크 → Register

3. **Service ID 생성** (웹 OAuth용)
   - Identifiers → + → Services IDs → Continue
   - Description: `Todo List Web`
   - Identifier: `com.yourname.todolist.web`
   - **Sign In with Apple** 체크 → Configure
     - Primary App ID: 위에서 만든 App ID 선택
     - Domains: `nysjoqpbycoalthsyydc.supabase.co`
     - Return URLs:
       ```
       https://nysjoqpbycoalthsyydc.supabase.co/auth/v1/callback
       ```
   - Save → Register

4. **Key 생성** (.p8 파일)
   - Keys → + → Key Name 입력
   - **Sign In with Apple** 체크 → Configure → Primary App ID 선택
   - Register → **Download** (단 1회만 다운로드 가능, 잘 보관)
   - Key ID 메모

#### 내가 할 일 (Supabase 대시보드)
```
Authentication → Providers → Apple → Enable
```
입력 항목:
| 항목 | 값 출처 |
|------|---------|
| Service ID | 위 3번에서 만든 Service ID Identifier |
| Team ID | Apple Developer 우측 상단 계정 정보 |
| Key ID | 위 4번에서 생성한 Key ID |
| Private Key | .p8 파일을 텍스트로 열어서 전체 내용 붙여넣기 |

> ⚠️ **6개월마다 Key 갱신 필수**: Apple Secret Key는 만료 기간이 없지만 보안 정책상 **6개월마다 새 Key를 생성해 Supabase에 업데이트**해야 한다. 안 하면 로그인이 전면 중단된다. 캘린더에 리마인더 등록 필수.
>
> ⚠️ **이름 정보 1회만 제공**: Apple은 최초 로그인 시에만 사용자 이름을 제공한다. 이후 로그인에서는 `null` 반환. 필요 시 첫 로그인 때 `updateUser()`로 저장해야 한다.

---

## 코드 구현 (내가 할 일 — 세 Provider 동일)

### app.js에 추가할 함수
```js
async function signInWithProvider(provider) {
  const { error } = await db.auth.signInWithOAuth({
    provider,   // 'google' | 'kakao' | 'apple'
    options: {
      redirectTo: 'https://ksw19627.github.io/todoList/'
    }
  })
  if (error) console.error(error)
}
```

### index.html에 추가할 버튼 (인증 카드 하단)
```html
<div class="oauth-divider"><span>또는</span></div>
<div class="oauth-buttons">
  <button class="oauth-btn" onclick="signInWithProvider('google')">
    <img src="https://www.google.com/favicon.ico" width="18"> Google
  </button>
  <button class="oauth-btn" onclick="signInWithProvider('kakao')">
    <img src="https://developers.kakao.com/favicon.ico" width="18"> Kakao
  </button>
  <button class="oauth-btn" onclick="signInWithProvider('apple')">
    🍎 Apple
  </button>
</div>
```

### 로그인 후 처리
OAuth 성공 후 Supabase가 `redirectTo` URL로 돌아오면
기존 `onAuthStateChange`가 `SIGNED_IN` 이벤트를 자동으로 잡아 투두 뷰로 전환.
**추가 코드 불필요.**

---

## 구현 권장 순서

1. **Google** 먼저 — 가장 쉽고 사용자가 많음
2. **Kakao** 두 번째 — 국내 서비스라 유용
3. **Apple** 마지막 — 유료 계정 있을 때

---

## 내가 할 일 / 네가 할 일 구분

| 작업 | 담당 |
|------|------|
| Google Cloud Console OAuth 앱 생성 | 내가 |
| Kakao Developers 앱 생성 및 설정 | 내가 |
| Apple Developer 앱/키 생성 | 내가 (유료 계정 필요) |
| Supabase 대시보드 Provider 활성화 | 내가 |
| Supabase Redirect URL 등록 | 내가 |
| app.js OAuth 버튼 함수 추가 | 네가 (Claude) |
| index.html 버튼 UI 추가 | 네가 (Claude) |
| style.css OAuth 버튼 스타일 | 네가 (Claude) |
| 커밋 & 푸시 | 네가 (Claude) |
