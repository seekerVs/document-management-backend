# Document Management Backend

Express + TypeScript backend for the Document Management System.

## Endpoints

| Method | Route                                   | Description                             |
| ------ | --------------------------------------- | --------------------------------------- |
| GET    | `/health`                               | Health check                            |
| POST   | `/api/auth/send-otp`                    | Send OTP to email for password reset    |
| POST   | `/api/auth/verify-otp`                  | Verify OTP code                         |
| POST   | `/api/auth/reset-password`              | Reset password with verified OTP        |
| POST   | `/api/signing/send-link`                | Send signing link email to guest signer |
| GET    | `/api/signing/validate-token?token=xxx` | Validate a signing token                |

All `/api/*` routes require the `x-api-key` header.

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Fill in .env values (see below)

# 4. Add Firebase service account
# Firebase Console → Project Settings → Service Accounts
# → Generate new private key → save as firebase-service-account.json

# 5. Run in development
npm run dev
```

## Gmail App Password Setup

1. Enable 2-Step Verification on your Google account
2. Go to: Google Account → Security → 2-Step Verification → App Passwords
3. Create a new App Password for "Mail"
4. Copy the 16-character password into `GMAIL_APP_PASSWORD` in `.env`

## Deploy to Render

1. Push this folder to a GitHub repository
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set environment variables in the Render dashboard

- Include `FIREBASE_STORAGE_BUCKET` (for example: `your-project-id.appspot.com`)

5. For `firebase-service-account.json`: paste the JSON content as an
   environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` and update
   `firebase.service.ts` to read from it (see note below)

## Render Note: Service Account File

On Render you can't upload files directly. Instead:

1. Copy the entire contents of `firebase-service-account.json`
2. Add it as an env var: `FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}`
3. Update `src/services/firebase.service.ts` to use:

```typescript
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
```

## Flutter Integration

Add to your Flutter `http` calls:

```dart
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'your_api_secret_key',
}
```
