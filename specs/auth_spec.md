# Authentication & User Management Specification

## 1. Overview
User authentication and registration are handled exclusively via **Log in with
Google** (Google OAuth2 / OpenID Connect ID token verification).
All communication occurs strictly over **HTTPS**.

User identity:
- **Unique User Identifier**: The user's **email** acts as the primary
  `user_id` / identifier across all backend services, databases, and sessions.
- **Customizable Username**: Users can set an optional custom username
  (strictly `^[a-zA-Z]+$`).
- **Default State**: Upon first registration, the username is **empty** (`""`).
- **UI Behavior**:
  - If a user has not set a username yet, the full-canvas **Settings** tile
    opens automatically with a banner: `"Please set yourself a username"`.
  - Once set, the top bar displays the chosen username (or fallback to email
    prefix if not yet chosen), and the normal workspace canvas is shown.
  - The Settings icon on the top navigation bar toggles the full-canvas
    Settings tile at any time.

---

## 2. Storage Schema (Textproto)

Stored as plain textproto files in `run/storage/` and queried sequentially.

### 2.1 Users (`run/storage/users.textproto`)
- `email`: User primary email (unique identifier).
- `username`: Customizable username (letters only, empty by default).
- `google_id`: Unique subject ID from Google.

```proto
syntax = "proto3";
package doki.auth;

message User {
  string email = 1;      // Unique user identifier
  string username = 2;   // Customizable name (default "")
  string google_id = 3;  // Google subject ID
}

message UserDatabase {
  repeated User users = 1;
}
```

### 2.2 Sessions (`run/storage/sessions.textproto`)
- `session_token`: Secure random token.
- `user_id`: References the user's `email`.
- `expires_at_ms`: Expiration epoch timestamp.

```proto
syntax = "proto3";
package doki.auth;

message Session {
  string session_token = 1;
  string user_id = 2;        // Email identifying the user
  int64 expires_at_ms = 3;
}

message SessionDatabase {
  repeated Session sessions = 1;
}
```

---

## 3. API Endpoints (HTTPS REST over Proto/JSON)

### 3.1 Login with Google
- **Path**: `POST /api/auth/google`
- **Security**: HTTPS only
- Request: `GoogleLoginRequest { string id_token = 1; }`
- Response: `GoogleLoginResponse { bool success = 1; string error_message = 2; string username = 3; string email = 4; }`
- Sets `doki_session` cookie on success.

### 3.2 Set Username (via Settings)
- **Path**: `POST /api/auth/set_username`
- **Security**: HTTPS, requires valid `doki_session` cookie
- Request: `SetUsernameRequest { string desired_name = 1; }`
- Response: `SetUsernameResponse { bool success = 1; string error_message = 2; string username = 3; }`

### 3.3 Current Authenticated User
- **Path**: `GET /api/auth/me`
- **Security**: HTTPS, requires `doki_session` cookie
- Response: `GetMeResponse { bool authenticated = 1; string username = 2; string email = 3; }`

### 3.4 Logout
- **Path**: `POST /api/auth/logout`
- **Security**: HTTPS, requires `doki_session` cookie
