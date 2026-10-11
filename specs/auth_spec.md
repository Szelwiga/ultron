# Authentication Specification: Google Login & Username Management

## 1. Overview
User authentication and registration are handled exclusively via **Log in with
Google** (Google OAuth2 / OpenID Connect ID token verification).
All communication occurs strictly over **HTTPS**.

User identity is defined by a unique handle in the format:
`<name>#<tag>` (e.g. `Alice#8391`).
- `<name>`: The user's visible display name. By default upon first login, this
  is derived from what came from Google auth (sanitized to `^[a-zA-Z]+$`).
- `<tag>`: The random suffix generated after `#`.
- **Backend User Distinction**:
  > [!IMPORTANT]
  > Across backend services and storage, **only the part after `#` (the tag)**
  > should be used to uniquely distinguish and identify users.
- **UI Display**:
  The `#<tag>` is an internal discriminator and must **never** be displayed
  in the user interface; only `<name>` is visible to users.

---

## 2. Authentication & Onboarding Flow

1. **Google Login Step**:
   - User signs in with Google on the login tile (`web/login/`).
   - Frontend receives Google ID token and sends `POST /api/auth/google`.
   - Backend verifies ID token, extracting `google_id`, `email`, and name.
   - Backend scans `run/storage/users.textproto`:
     - **Returning User** (found by `google_id`): Creates session in
       `run/storage/sessions.textproto`, sets `doki_session` cookie, and
       returns `needs_username_prompt = false`.
     - **New User** (not found):
       - Derives default `<name>` from Google auth data (filtering for
         `[a-zA-Z]`, or fallback if empty).
       - Generates a unique random `<tag>` (e.g. `8391`).
       - Creates user record with default `<name>#<tag>`.
       - Creates session in `run/storage/sessions.textproto` and issues
         `doki_session` cookie.
       - Returns `needs_username_prompt = true` so the UI can immediately
         prompt the user to customize their name if desired.

2. **Set Username Step**:
   - UI shows a prompt on first login giving the user the option to change
     their default name (only characters `^[a-zA-Z]+$` allowed).
   - Frontend calls `POST /api/auth/set_username` with the chosen name.
   - Backend validates `^[a-zA-Z]+$`, locates the user by their authenticated
     session, updates the `<name>` prefix while preserving the unique `<tag>`,
     and saves to `run/storage/users.textproto`.

---

## 3. Storage Schema (Textproto)

Per project guidelines, databases are stored as plain textproto files in
`run/storage/` and queried sequentially.

### 3.1 Users (`run/storage/users.textproto`)
- `username`: `<name>#<tag>`. The `<tag>` part uniquely identifies the user.
- `email`: User email from Google.
- `google_id`: Unique subject ID from Google.

```proto
syntax = "proto3";
package doki.auth;

message User {
  string username = 1;   // e.g. "Alice#8391"
  string email = 2;      // e.g. "alice@example.com"
  string google_id = 3;  // Google subject ID
}

message UserDatabase {
  repeated User users = 1;
}
```

Example in `run/storage/users.textproto`:
```textproto
users {
  username: "Alice#8391"
  email: "alice@example.com"
  google_id: "109876543210987654321"
}
```

### 3.2 Sessions (`run/storage/sessions.textproto`)
- `user_tag`: The tag after `#` used to identify the user.
- `session_token`: Secure random token.
- `expires_at_ms`: Expiration timestamp in ms.

```proto
syntax = "proto3";
package doki.auth;

message Session {
  string session_token = 1;
  string user_tag = 2;       // The unique tag identifying the user
  int64 expires_at_ms = 3;
}

message SessionDatabase {
  repeated Session sessions = 1;
}
```

---

## 4. API Endpoints (HTTPS REST over Proto)

### 4.1 Login with Google
- **Path**: `POST /api/auth/google`
- **Security**: HTTPS only

#### Request: `GoogleLoginRequest`
```proto
message GoogleLoginRequest {
  string id_token = 1;  // OIDC ID token from Google
}
```

#### Response: `GoogleLoginResponse`
```proto
message GoogleLoginResponse {
  bool success = 1;
  string error_message = 2;
  bool needs_username_prompt = 3;  // True on first login to trigger name prompt
  string display_name = 4;         // Base name without #tag for UI
}
```
*Note*: Sets `Set-Cookie: doki_session=...; Secure; HttpOnly; SameSite=Strict`.

---

### 4.2 Set Username
- **Path**: `POST /api/auth/set_username`
- **Security**: HTTPS, requires `doki_session` cookie

#### Request: `SetUsernameRequest`
```proto
message SetUsernameRequest {
  string desired_name = 1;  // Must match ^[a-zA-Z]+$
}
```

#### Response: `SetUsernameResponse`
```proto
message SetUsernameResponse {
  bool success = 1;
  string error_message = 2;
  string display_name = 3;  // Updated display name
}
```

---

### 4.3 Current Authenticated User
- **Path**: `GET /api/auth/me`
- **Security**: HTTPS, requires `doki_session` cookie

#### Response: `GetMeResponse`
```proto
message GetMeResponse {
  bool authenticated = 1;
  string display_name = 2;  // Base name without #tag for UI
}
```

---

### 4.4 Logout
- **Path**: `POST /api/auth/logout`
- **Security**: HTTPS, requires `doki_session` cookie
- Invalidates session in `run/storage/sessions.textproto` and clears cookie.
