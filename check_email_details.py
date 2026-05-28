
import os.path
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def main():
    creds = None
    if os.path.exists('token.json'):
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            print("No valid credentials found.")
            return

    service = build('gmail', 'v1', credentials=creds)
    message_id = '19dfbbf88e0d735e'
    
    msg = service.users().messages().get(userId='me', id=message_id).execute()
    print(f"Labels: {msg['labelIds']}")
    print(f"Snippet: {msg['snippet']}")

if __name__ == '__main__':
    main()
